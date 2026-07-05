import { serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'
import { retryFailedArchiveDeliveries } from '@/lib/services/archivePipeline'
import { getRetentionSettings, getEffectiveRetentionDays } from '@/lib/services/retention'
import { runInspectionScheduler } from '@/lib/services/inspectionScheduling'

export async function runScheduledCleanupJob() {
  if (!supabaseAdmin) throw new Error(serverConfigErrorMessage)

  const { data: runData, error: runError } = await supabaseAdmin
    .from('scheduled_cleanup_runs')
    .insert([{ status: 'running' }])
    .select('id')
    .single()

  if (runError || !runData) {
    throw runError ?? new Error('Failed to start cleanup run.')
  }

  const runId = runData.id as string

  try {
    const scheduler = await runInspectionScheduler()

    const retentionSettings = await getRetentionSettings()
    const retentionDays = getEffectiveRetentionDays(retentionSettings)

    const retryStats = await retryFailedArchiveDeliveries(retentionSettings.maxDeliveryRetries)

    const retentionCutoff = new Date()
    retentionCutoff.setUTCDate(retentionCutoff.getUTCDate() - retentionDays)

    // Find inspections eligible for cleanup: archived and older than cutoff
    const { data: deletableInspections, error: deletableError } = await supabaseAdmin
      .from('inspections')
      .select('id, archived_at, archived_reference')
      .eq('archive_status', 'archived')
      .lt('completed_at', retentionCutoff.toISOString())

    if (deletableError) throw deletableError

    let processed = 0
    const storageBytesFreed = 0
    const ids = (deletableInspections ?? []).map((row) => row.id as string)

    const BUCKET = 'inspection-photos'

    // Precompute counts and paths for estimate
    let totalPhotoFilesToDelete = 0
    let totalInspectionItemsToDelete = 0
    let totalDraftsToDelete = 0
    const allItemIds: string[] = []

    if (ids.length > 0) {
      const { data: allItems } = await supabaseAdmin.from('inspection_items').select('id,inspection_id').in('inspection_id', ids)
      for (const it of (allItems ?? [])) {
        allItemIds.push(it.id as string)
      }

      totalInspectionItemsToDelete = allItemIds.length

      if (allItemIds.length > 0) {
        const { data: allPhotos } = await supabaseAdmin.from('photo_uploads').select('id,storage_path').in('inspection_item_id', allItemIds)
        totalPhotoFilesToDelete = (allPhotos ?? []).length
      }

      const { data: drafts } = await supabaseAdmin.from('inspection_drafts').select('id').in('inspection_id', ids)
      totalDraftsToDelete = (drafts ?? []).length
    }

    // Estimate bytes: assume average photo size (bytes) and small DB row sizes
    const AVG_PHOTO_SIZE = 200_000 // 200KB average per photo (estimate)
    const EST_PHOTO_META_ROW = 1024 // bytes per photo_uploads row
    const EST_ITEM_ROW = 800
    const EST_DRAFT_ROW = 1024

    const estimatedFileBytes = totalPhotoFilesToDelete * AVG_PHOTO_SIZE
    const estimatedDbBytes = totalPhotoFilesToDelete * EST_PHOTO_META_ROW + totalInspectionItemsToDelete * EST_ITEM_ROW + totalDraftsToDelete * EST_DRAFT_ROW

    // We'll report estimated savings based on these values; actual freed bytes may vary

    for (const inspectionId of ids) {
      try {
        // Verify archive exists and contains PDF
        const { data: archiveRows, error: archiveErr } = await supabaseAdmin
          .from('inspection_archives')
          .select('id, file_name, pdf_base64')
          .eq('inspection_id', inspectionId)
          .limit(1)
          .maybeSingle()

        if (archiveErr || !archiveRows || !archiveRows.pdf_base64) {
          // Skip deletion if archive missing or PDF not present
          await supabaseAdmin.from('inspections').update({ archive_status: 'failed' }).eq('id', inspectionId)
          continue
        }

        // Gather inspection item ids
        const { data: itemsData } = await supabaseAdmin.from('inspection_items').select('id').eq('inspection_id', inspectionId)
        const itemIds: string[] = (itemsData ?? []).map((r) => r.id as string)

        // Gather photos for these items
        const photoPaths: string[] = []
        if (itemIds.length > 0) {
          const { data: photos } = await supabaseAdmin
            .from('photo_uploads')
            .select('id, storage_path')
            .in('inspection_item_id', itemIds)

          for (const p of (photos ?? [])) {
            if (p && (p.storage_path as string)) photoPaths.push(p.storage_path as string)
          }
        }

        // Delete storage objects (idempotent)
        for (const path of photoPaths) {
          try {
            const { error: remErr } = await supabaseAdmin.storage.from(BUCKET).remove([path])
            if (remErr) {
              // ignore not found errors
              console.warn('[cleanup] storage remove error', path, remErr.message)
            }
          } catch (e) {
            console.warn('[cleanup] storage remove exception', path, e)
          }
        }


        // Compute overall result if possible (read-only, preserved on inspection row)
        await supabaseAdmin.from('inspection_items').select('answer').eq('inspection_id', inspectionId)

        // Delete photo_uploads rows for these items
        if (itemIds.length > 0) {
          await supabaseAdmin.from('photo_uploads').delete().in('inspection_item_id', itemIds)
        }

        // Delete inspection_items
        await supabaseAdmin.from('inspection_items').delete().eq('inspection_id', inspectionId)

        // Delete drafts
        await supabaseAdmin.from('inspection_drafts').delete().eq('inspection_id', inspectionId)

        // Best-effort: delete temporary cache tables if present (ignore errors)
        try {
          await supabaseAdmin.from('inspection_cache').delete().eq('inspection_id', inspectionId)
        } catch (e) {
          // table may not exist; ignore
        }

        try {
          await supabaseAdmin.from('inspection_temp_files').delete().eq('inspection_id', inspectionId)
        } catch (e) {
          // table may not exist; ignore
        }

        // DO NOT overwrite or replace inspections.checklist — keep audit record intact

        processed += 1
      } catch (e) {
        console.error('[cleanup] failed for inspection', inspectionId, e instanceof Error ? e.message : e)
        // mark as failed to retry later
        await supabaseAdmin.from('inspections').update({ archive_status: 'failed' }).eq('id', inspectionId)
      }
    }

    const estimatedTotalBytes = estimatedFileBytes + estimatedDbBytes

    const summary = {
      scheduler,
      retryStats,
      retentionDays,
      processed,
      estimated: {
        photoFiles: totalPhotoFilesToDelete,
        inspectionItems: totalInspectionItemsToDelete,
        drafts: totalDraftsToDelete,
        estimatedFileBytes,
        estimatedDbBytes,
        estimatedTotalBytes,
      },
      storageBytesFreed: storageBytesFreed,
      completedAt: new Date().toISOString(),
    }

    await supabaseAdmin
      .from('scheduled_cleanup_runs')
      .update({ status: 'success', completed_at: new Date().toISOString(), summary })
      .eq('id', runId)

    return { runId, summary }
  } catch (error) {
    await supabaseAdmin
      .from('scheduled_cleanup_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        summary: {
          error: error instanceof Error ? error.message : 'Scheduled cleanup failed.',
        },
      })
      .eq('id', runId)

    throw error
  }
}
