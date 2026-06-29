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

async function addCompanyHeader(doc: PDFKit.PDFDocument, company: CompanyBranding, title: string) {
  const primary = company.primaryColor || '#0f172a'
  const accent = company.accentColor || '#475569'

  if (company.logoUrl) {
    const currentY = doc.y
    const usedLogo = await addImageSafe(doc, company.logoUrl, {
      fit: [140, 42],
      x: 36,
      y: currentY,
    })
    if (usedLogo) {
      doc.y = currentY + 48
    } else {
      doc.fillColor(accent).fontSize(9).text('Company Logo: N/A')
      doc.moveDown(0.2)
    }
  } else {
    doc.fillColor(accent).fontSize(9).text('Company Logo: N/A')
    doc.moveDown(0.2)
  }

  doc.fillColor(primary).fontSize(24).text(company.companyName || 'MGMT Inspect')
  doc.fillColor('#64748b').fontSize(10).text('MGMT Inspect')
  doc.moveDown(0.25)
  doc.fillColor(accent).fontSize(10)
  if (company.address) doc.text(company.address)
  if (company.telephone) doc.text(company.telephone)
  if (company.email) doc.text(company.email)
  if (company.website) doc.text(company.website)

  doc.moveDown(1)
  doc.fillColor(primary).fontSize(16).text(title)
  doc.moveDown(0.5)
}

function addResultBanner(doc: PDFKit.PDFDocument, result: 'PASS' | 'FAIL' | 'INCOMPLETE') {
  const label = result === 'PASS' ? 'PASS' : 'FAIL'
  const background = label === 'PASS' ? '#16a34a' : '#dc2626'
  const top = doc.y

  doc.save()
  doc.roundedRect(36, top, doc.page.width - 72, 28, 6).fill(background)
  doc
    .fillColor('#ffffff')
    .fontSize(14)
    .text(`Inspection Result: ${label}`, 36, top + 8, {
      width: doc.page.width - 72,
      align: 'center',
    })
  doc.restore()
  doc.moveDown(2.2)
}

function addMetadataTable(doc: PDFKit.PDFDocument, details: Array<[string, string]>) {
  for (const [label, value] of details) {
    doc.fontSize(10).fillColor('#334155').text(`${label}: `, { continued: true })
    const resultColor = label === 'Result'
      ? value === 'PASS'
        ? '#166534'
        : value === 'FAIL'
          ? '#b91c1c'
          : '#92400e'
      : '#0f172a'
    doc.fillColor(resultColor).text(value)
  }
}

function ensureSectionSpace(doc: PDFKit.PDFDocument, minHeight = 120) {
  if (doc.y + minHeight > doc.page.height - 48) {
    doc.addPage()
  }
}

async function addChecklistSection(doc: PDFKit.PDFDocument, items: InspectionPdfItem[]) {
  doc.moveDown(1)
  doc.fontSize(12).fillColor('#0f172a').text('Checklist')
  doc.moveDown(0.3)

  for (const item of items) {
    doc.fontSize(10).fillColor('#0f172a').text(`${item.displayOrder}. ${toDisplay(item.question)}`)
    doc.fillColor('#475569').text(`Answer: ${toDisplay(item.answer)}`)
    doc.text(`Comments: ${toDisplay(item.comments)}`)

    const photos = getPhotoCandidates(item.photos)
    if (photos.length > 0) {
      doc.fillColor('#475569').text(`Photos: ${photos.length} attached`)
      for (const photo of photos) {
        ensureSectionSpace(doc, 180)
        const added = await addImageSafe(doc, photo, { fit: [220, 140] })
        if (!added) {
          doc.fillColor('#475569').text('Photo: N/A')
        }
        doc.moveDown(0.2)
      }
    } else {
      doc.fillColor('#475569').text('Photos: N/A')
    }

    if (item.signatureData) {
      doc.fillColor('#475569').text('Signature:')
      const added = await addImageSafe(doc, item.signatureData, { fit: [180, 70] })
      if (!added) {
        doc.fillColor('#475569').text('Signature: N/A')
      }
      doc.moveDown(0.2)
    } else {
      doc.fillColor('#475569').text('Signature: N/A')
    }

    doc.moveDown(0.3)
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
  doc.moveDown(0.5)
  doc.fontSize(12).fillColor('#0f172a').text('Defects')
  doc.moveDown(0.3)

  if (defects.length === 0) {
    doc.fontSize(10).fillColor('#475569').text('Defects: N/A')
    return
  }

  for (const defect of defects) {
    doc.fontSize(10).fillColor('#0f172a').text(`${toDisplay(defect.title)} [${toDisplay(defect.severity)}] - ${toDisplay(defect.status)}`)
    doc.fillColor('#475569').text(`Description: ${toDisplay(defect.description)}`)
    const photos = getPhotoCandidates(defect.photos ?? [])
    if (photos.length > 0) {
      for (const photo of photos) {
        ensureSectionSpace(doc, 180)
        const added = await addImageSafe(doc, photo, { fit: [220, 140] })
        if (!added) doc.fillColor('#475569').text('Defect Photo: N/A')
      }
    } else {
      doc.fillColor('#475569').text('Defect Photos: N/A')
    }
    doc.moveDown(0.3)
  }
}

function addFooter(doc: PDFKit.PDFDocument, footerText: string, reference?: string, version?: string) {
  doc.moveDown(1)
  const meta = [footerText, reference ? `Reference: ${reference}` : null, version ? `Version: ${version}` : null]
    .filter(Boolean)
    .join(' | ')
  doc.fontSize(9).fillColor('#64748b').text(meta)

  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i)
    doc.fontSize(8)
    doc.fillColor('#94a3b8')
    doc.text(`Page ${i + 1} of ${range.count}`, 36, doc.page.height - 28, {
      width: doc.page.width - 72,
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

  await addCompanyHeader(doc, input.company, input.reportTitle)
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
    companyFooter || 'Generated by MGMT Inspect',
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
  const company = input.company || { companyName: 'MGMT Inspect' }

  await addCompanyHeader(doc, company, input.title)
  for (const line of input.lines) {
    doc.fontSize(11).fillColor('#334155').text(line)
  }

  addFooter(doc, company.reportFooter || 'Generated by MGMT Inspect', undefined, company.reportVersion || process.env.NEXT_PUBLIC_APP_VERSION || 'Release 1')
  return finalizePdf(doc)
}

export async function createTestPDF(input: SimplePdfInput) {
  return createSystemHealthPDF(input)
}
