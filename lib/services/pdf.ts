import path from 'path'
import PDFKit from 'pdfkit'
import { formatInspectionDate, formatInspectionDateTime, formatInspectionTime } from '@/lib/inspectionTime'

type CompanyBranding = {
  companyName: string
  logoUrl?: string | null
  address?: string | null
  telephone?: string | null
  email?: string | null
  website?: string | null
  reportFooter?: string | null
  primaryColor?: string | null
  accentColor?: string | null
  reportVersion?: string | null
}

type InspectionPdfItem = {
  displayOrder: number
  question: string
  description?: string | null
  answer: string | null
  comments: string | null
  photos: unknown[]
  signatureData: string | null
}

type InspectionPdfDefect = {
  title: string
  severity: string
  status: string
  description: string | null
  photos?: unknown[]
}

type InspectionPdfInput = {
  company: CompanyBranding
  reportTitle: string
  machineName: string
  assetId: string | null
  department: string | null
  templateName: string
  inspectionFrequency?: string | null
  inspectionStatus?: string | null
  inspector: string
  startedAt: string | null
  completedAt: string | null
  result: 'PASS' | 'FAIL' | 'INCOMPLETE'
  reference: string
  items: InspectionPdfItem[]
  defects: InspectionPdfDefect[]
}

type SimplePdfInput = {
  title: string
  lines: string[]
  company?: CompanyBranding
}

const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'DejaVuSans.ttf')

function formatDateTime(value: string | null) {
  return formatInspectionDateTime(value)
}

function formatDateOnly(value: string | null) {
  return formatInspectionDate(value)
}

function formatTimeOnly(value: string | null) {
  return formatInspectionTime(value)
}

function toDisplay(value: string | null | undefined) {
  const normalized = (value ?? '').trim()
  return normalized || 'N/A'
}

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt || !completedAt) return 'N/A'
  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(completedAt).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return 'N/A'

  const totalMinutes = Math.round((endMs - startMs) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function createPdfDocument() {
  const doc = new PDFKit({
    size: 'A4',
    margin: 36,
    autoFirstPage: true,
    bufferPages: true,
    // Set default font at constructor time to avoid Helvetica AFM fallback.
    font: FONT_PATH,
  })
  return doc
}

function decodeDataUrl(value: string): Buffer | null {
  const match = value.match(/^data:.*?;base64,(.+)$/)
  if (!match) return null
  try {
    return Buffer.from(match[1], 'base64')
  } catch {
    return null
  }
}

async function readImageSource(source: string): Promise<Buffer | string | null> {
  if (!source) return null
  if (source.startsWith('data:image/')) return decodeDataUrl(source)
  if (source.startsWith('http://') || source.startsWith('https://')) {
    try {
      const response = await fetch(source)
      if (!response.ok) return null
      const bytes = await response.arrayBuffer()
      return Buffer.from(bytes)
    } catch {
      return null
    }
  }
  return source
}

async function addImageSafe(
  doc: PDFKit.PDFDocument,
  source: string,
  options: { fit?: [number, number]; align?: 'center' | 'right'; x?: number; y?: number }
) {
  const payload = await readImageSource(source)
  if (!payload) return false

  try {
    if (options.x !== undefined && options.y !== undefined) {
      doc.image(payload, options.x, options.y, {
        fit: options.fit,
        align: options.align,
      })
    } else {
      doc.image(payload, {
        fit: options.fit,
        align: options.align,
      })
    }
    return true
  } catch {
    return false
  }
}

function getPhotoCandidates(photos: unknown[]) {
  const candidates: string[] = []
  for (const photo of photos) {
    if (typeof photo === 'string') {
      candidates.push(photo)
      continue
    }

    if (photo && typeof photo === 'object') {
      const rec = photo as Record<string, unknown>
      const maybeUrl = rec.url ?? rec.path ?? rec.src
      if (typeof maybeUrl === 'string') candidates.push(maybeUrl)
    }
  }
  return candidates
}

async function addCompanyHeader(
  doc: PDFKit.PDFDocument,
  company: CompanyBranding,
  title: string,
  reference?: string | null,
  completedAt?: string | null
) {
  const primary = company.primaryColor || '#0f172a'
  const accent = company.accentColor || '#475569'

  const margin = 36
  const contentWidth = doc.page.width - margin * 2
  const currentY = doc.y

  // Logo on left (disk path), large title to the right, metadata stacked on the far right.
  const logoPath = path.join(process.cwd(), 'public', 'images', 'mgpc-logo.png')
  // Draw logo if available
  await addImageSafe(doc, logoPath, { fit: [140, 48], x: margin, y: currentY })

  // Title — prominent and slightly larger for engineering report
  const titleX = margin + 160
  const titleWidth = contentWidth - 160
  doc.fillColor('#0f172a').fontSize(22).text(title, titleX, currentY + 2, { width: titleWidth - 120, align: 'left' })

  // Right side metadata
  const metaX = margin + titleWidth - 100
  const metaParts: string[] = []
  if (reference) metaParts.push(`Report ID: ${reference}`)
  if (completedAt) metaParts.push(`Inspection Date: ${formatDateOnly(completedAt)}`)
  if (metaParts.length > 0) {
    doc.fillColor('#64748b').fontSize(9).text(metaParts.join('\n'), metaX, currentY + 4, { width: 100, align: 'right' })
  }

  // Thin divider under header using primary color
  const dividerY = currentY + 56
  doc.save()
  doc.moveTo(margin, dividerY)
  doc.lineTo(doc.page.width - margin, dividerY)
  doc.lineWidth(1)
  doc.strokeColor(company.primaryColor || '#0f766e')
  doc.stroke()
  doc.restore()

  // Advance cursor past header
  doc.y = dividerY + 14
}

function addResultBanner(doc: PDFKit.PDFDocument, result: 'PASS' | 'FAIL' | 'INCOMPLETE') {
  const top = doc.y
  const fullWidth = doc.page.width - 72
  const badgeWidth = 120
  const badgeHeight = 36
  const badgeX = doc.page.width - 36 - badgeWidth

  // Draw subtle box for result on the right
  doc.save()
  if (result === 'PASS') {
    doc.roundedRect(badgeX, top, badgeWidth, badgeHeight, 6).fill('#16a34a')
    doc.fillColor('#ffffff').fontSize(12).text('PASS', badgeX, top + 10, { width: badgeWidth, align: 'center' })
  } else if (result === 'FAIL') {
    doc.roundedRect(badgeX, top, badgeWidth, badgeHeight, 6).fill('#dc2626')
    doc.fillColor('#ffffff').fontSize(12).text('FAIL', badgeX, top + 10, { width: badgeWidth, align: 'center' })
  } else {
    doc.roundedRect(badgeX, top, badgeWidth, badgeHeight, 6).fill('#b45309')
    doc.fillColor('#ffffff').fontSize(12).text('INCOMPLETE', badgeX, top + 10, { width: badgeWidth, align: 'center' })
  }
  doc.restore()

  // Add a small title for the report area
  doc.moveDown(0.6)
}

function addMetadataTable(doc: PDFKit.PDFDocument, details: Array<[string, string]>) {
  // Render a clean two-column summary with labels and values
  const margin = 36
  const colGap = 12
  const colWidth = (doc.page.width - margin * 2 - colGap) / 2
  const startX = margin
  let x = startX
  let y = doc.y

  doc.fontSize(10).fillColor('#475569')
  for (let i = 0; i < details.length; i += 1) {
    const [label, value] = details[i]
    // label
    doc.fontSize(9).fillColor('#94a3b8').text(`${label}`, x, y, { width: colWidth })
    // value below label
    doc.fontSize(11).fillColor('#0f172a').text(`${value}`, x, y + 12, { width: colWidth })

    // move to next column
    if (x === startX) {
      x = startX + colWidth + colGap
    } else {
      x = startX
      y += 36
    }
  }

  // Advance doc.y to after the table
  doc.y = y + 44
}

function ensureSectionSpace(doc: PDFKit.PDFDocument, minHeight = 120) {
  if (doc.y + minHeight > doc.page.height - 48) {
    doc.addPage()
  }
}

async function addChecklistSection(doc: PDFKit.PDFDocument, items: InspectionPdfItem[]) {
  // Modern table-like checklist
  ensureSectionSpace(doc, 120)
  doc.fontSize(12).fillColor('#0f172a').text('Inspection Details')
  doc.moveDown(0.4)

  const margin = 36
  const tableWidth = doc.page.width - margin * 2
  const colNo = 36
  const colQuestion = Math.floor(tableWidth * 0.55)
  const colAnswer = Math.floor(tableWidth * 0.12)
  const colComments = tableWidth - colNo - colQuestion - colAnswer - 12

  // Header row
  const headerY = doc.y
  doc.fontSize(9).fillColor('#94a3b8')
  doc.text('#', margin, headerY, { width: colNo })
  doc.text('Question', margin + colNo + 8, headerY, { width: colQuestion })
  doc.text('Result', margin + colNo + 8 + colQuestion + 8, headerY, { width: colAnswer, align: 'center' })
  doc.text('Comments', margin + colNo + 8 + colQuestion + 8 + colAnswer + 8, headerY, { width: colComments })
  doc.moveDown(0.8)

  for (const item of items) {
    ensureSectionSpace(doc, 80)
    const y = doc.y
    // No.
    doc.fontSize(10).fillColor('#64748b').text(String(item.displayOrder), margin, y, { width: colNo })
    // Question
    doc.fontSize(10).fillColor('#0f172a').text(toDisplay(item.question), margin + colNo + 8, y, { width: colQuestion })
    // Result badge
    const resultX = margin + colNo + 8 + colQuestion + 8
    if (item.answer === 'pass') {
      doc.roundedRect(resultX + 6, y - 2, colAnswer - 12, 18, 6).fill('#16a34a')
      doc.fillColor('#ffffff').fontSize(9).text('PASS', resultX + 6, y + 2, { width: colAnswer - 12, align: 'center' })
    } else if (item.answer === 'fail') {
      doc.roundedRect(resultX + 6, y - 2, colAnswer - 12, 18, 6).fill('#dc2626')
      doc.fillColor('#ffffff').fontSize(9).text('FAIL', resultX + 6, y + 2, { width: colAnswer - 12, align: 'center' })
    } else {
      doc.roundedRect(resultX + 6, y - 2, colAnswer - 12, 18, 6).fill('#334155')
      doc.fillColor('#ffffff').fontSize(9).text('N/A', resultX + 6, y + 2, { width: colAnswer - 12, align: 'center' })
    }

    // Comments
    doc.fontSize(9).fillColor('#475569').text(toDisplay(item.comments), margin + colNo + 8 + colQuestion + 8 + colAnswer + 8, y, { width: colComments })

    // Photos (small thumbnails after row)
    const photos = getPhotoCandidates(item.photos)
    if (photos.length > 0) {
      doc.moveDown(0.6)
      const thumbSize = 90
      let thumbX = margin + colNo + 8
      const startImgY = doc.y
      for (const photo of photos.slice(0, 4)) {
        ensureSectionSpace(doc, thumbSize + 20)
        const added = await addImageSafe(doc, photo, { fit: [thumbSize, thumbSize], x: thumbX, y: doc.y })
        if (!added) {
          doc.fontSize(9).fillColor('#475569').text('Photo: N/A', thumbX, doc.y)
        }
        thumbX += thumbSize + 8
      }
      doc.y = startImgY + thumbSize + 6
    } else {
      doc.moveDown(0.6)
    }
    doc.moveDown(0.4)
  }
}

async function addSignaturesSection(doc: PDFKit.PDFDocument, items: InspectionPdfItem[]) {
  doc.moveDown(0.5)
  doc.fontSize(12).fillColor('#0f172a').text('Signatures')
  doc.moveDown(0.3)

  const signatureItems = items.filter((item) => Boolean(item.signatureData))
  const inspectorSignature = signatureItems[0] ?? null
  const supervisorSignature =
    signatureItems.find((item) => /supervisor/i.test(item.question)) ?? signatureItems[1] ?? null

  doc.fillColor('#475569').text('Inspector Signature:')
  if (inspectorSignature?.signatureData) {
    const added = await addImageSafe(doc, inspectorSignature.signatureData, { fit: [220, 90] })
    if (!added) doc.text('N/A')
  } else {
    doc.text('N/A')
  }

  doc.moveDown(0.2)
  doc.fillColor('#475569').text('Supervisor Signature:')
  if (supervisorSignature?.signatureData) {
    const added = await addImageSafe(doc, supervisorSignature.signatureData, { fit: [220, 90] })
    if (!added) doc.text('N/A')
  } else {
    doc.text('N/A')
  }
}

async function addDefectsSection(doc: PDFKit.PDFDocument, defects: InspectionPdfDefect[]) {
  // Dedicated Defect Summary
  doc.moveDown(0.5)
  doc.fontSize(12).fillColor('#0f172a').text('Defect Summary')
  doc.moveDown(0.3)

  if (defects.length === 0) {
    doc.fontSize(10).fillColor('#475569').text('None')
    return
  }

  for (const defect of defects) {
    ensureSectionSpace(doc, 160)
    // Heading with severity badge
    const y = doc.y
    doc.fontSize(11).fillColor('#0f172a').text(toDisplay(defect.title), 36, y)
    const sevX = doc.page.width - 160
    const severityLabel = toDisplay(defect.severity).toUpperCase()
    doc.roundedRect(sevX, y - 2, 100, 18, 6).fill('#f1f5f9')
    doc.fillColor('#0f172a').fontSize(9).text(severityLabel, sevX, y + 2, { width: 100, align: 'center' })
    doc.moveDown(0.6)

    // Status and description
    doc.fontSize(10).fillColor('#475569').text(`Status: ${toDisplay(defect.status)}`)
    if (defect.description) {
      doc.moveDown(0.2)
      doc.fontSize(10).fillColor('#475569').text(toDisplay(defect.description))
    }

    const photos = getPhotoCandidates(defect.photos ?? [])
    if (photos.length > 0) {
      doc.moveDown(0.4)
      const thumbSize = 120
      let thumbX = 36
      const startImgY = doc.y
      for (const photo of photos.slice(0, 3)) {
        ensureSectionSpace(doc, thumbSize + 20)
        const added = await addImageSafe(doc, photo, { fit: [thumbSize, thumbSize], x: thumbX, y: doc.y })
        if (!added) {
          doc.fontSize(9).fillColor('#475569').text('Photo: N/A', thumbX, doc.y)
        }
        thumbX += thumbSize + 8
      }
      doc.y = startImgY + thumbSize + 6
    }

    doc.moveDown(0.6)
  }
}

function addFooter(doc: PDFKit.PDFDocument, footerText: string, reference?: string, version?: string) {
  // Footer with branding and page numbers
  const margin = 36
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i)
    const footerY = doc.page.height - 48
    // small logo on the left
    const logoPath = path.join(process.cwd(), 'public', 'images', 'mgpc-logo.png')
    // best-effort draw
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    addImageSafe(doc, logoPath, { fit: [80, 24], x: margin, y: footerY - 6 })

    // footer text center
    doc.fontSize(9).fillColor('#94a3b8').text(footerText, margin + 80 + 8, footerY, { width: doc.page.width - margin * 2 - 160, align: 'center' })

    // page number right
    doc.fontSize(8).fillColor('#94a3b8').text(`Page ${i + 1} of ${range.count}`, margin, footerY, {
      width: doc.page.width - margin * 2,
      align: 'right',
    })
  }
}

function finalizePdf(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

export async function createInspectionReportPDF(input: InspectionPdfInput) {
  const doc = createPdfDocument()
  await addCompanyHeader(doc, input.company, input.reportTitle, input.reference, input.completedAt)
  addResultBanner(doc, input.result)

  const companyFooter = [
    input.company.reportFooter || null,
    input.company.address || null,
    input.company.telephone || null,
    input.company.email || null,
    input.company.website || null,
  ]
    .filter(Boolean)
    .join(' | ')

  const details: Array<[string, string]> = [
    ['Inspection Report', toDisplay(input.reportTitle)],
    ['Machine', toDisplay(input.machineName)],
    ['Inspection Status', toDisplay(input.inspectionStatus ?? input.result)],
    ['Asset ID', toDisplay(input.assetId)],
    ['Department', toDisplay(input.department)],
    ['Template', toDisplay(input.templateName)],
    ['Inspection Frequency', toDisplay(input.inspectionFrequency)],
    ['Inspector', toDisplay(input.inspector)],
    ['Date', formatDateOnly(input.completedAt)],
    ['Time', formatTimeOnly(input.completedAt)],
    ['Started', formatDateTime(input.startedAt)],
    ['Completed', formatDateTime(input.completedAt)],
    ['Duration', formatDuration(input.startedAt, input.completedAt)],
    ['Result', input.result === 'PASS' ? 'PASS' : 'FAIL'],
    ['Reference Number', toDisplay(input.reference)],
  ]

  addMetadataTable(doc, details)
  await addChecklistSection(doc, input.items)
  await addSignaturesSection(doc, input.items)
  await addDefectsSection(doc, input.defects)

  addFooter(
    doc,
    companyFooter || 'Generated by MGPC Inspect',
    input.reference,
    input.company.reportVersion || process.env.NEXT_PUBLIC_APP_VERSION || 'Release 1'
  )
  return finalizePdf(doc)
}

export async function createArchivePDF(input: InspectionPdfInput) {
  return createInspectionReportPDF(input)
}

export async function createSystemHealthPDF(input: SimplePdfInput) {
  const doc = createPdfDocument()
  const company = input.company || { companyName: 'MGPC Inspect' }
  await addCompanyHeader(doc, company, input.title)
  for (const line of input.lines) {
    doc.fontSize(11).fillColor('#334155').text(line)
  }

  addFooter(doc, company.reportFooter || 'Generated by MGPC Inspect', undefined, company.reportVersion || process.env.NEXT_PUBLIC_APP_VERSION || 'Release 1')
  return finalizePdf(doc)
}

export async function createTestPDF(input: SimplePdfInput) {
  return createSystemHealthPDF(input)
}
