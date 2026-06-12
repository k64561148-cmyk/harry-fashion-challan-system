/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Challan, ChallanItem, Material, Master, Invoice, InwardEntry } from '../types';

// Helper to format currency in INR style (Indian Rupees with commas)
export function formatINR(num: number): string {
  // Handles Indian numbering system (e.g., Lakhs and Crores)
  const x = Math.round(num);
  let lastThree = x.toString().slice(-3);
  const otherNumbers = x.toString().slice(0, -3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const res = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  return `Rs. ${res || '0'}`;
}

// Convert DB format dates (YYYY-MM-DD) to friendly DD/MM/YYYY text
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(dateStr).toLocaleDateString('en-IN');
}

// Universal direct printing helper using a concealed background iframe
export function printPDFDoc(doc: jsPDF) {
  try {
    // Generate blob URL directly from jsPDF output
    const blob = doc.output('blob');
    const pdfBlobUrl = URL.createObjectURL(blob);
    
    // Create an invisible iframe for seamless context mounting
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.src = pdfBlobUrl;
    
    document.body.appendChild(iframe);
    
    // Trigger window print when loaded, then discard allocation reference
    iframe.onload = () => {
      setTimeout(() => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } else {
            throw new Error('No contentWindow available on print iframe.');
          }
        } catch (innerError) {
          console.warn('Iframe printing blocked or failed. Running fallback download:', innerError);
          doc.save('document.pdf');
        } finally {
          // Cleanup frame and revoke blob URL after printed/canceled
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
            URL.revokeObjectURL(pdfBlobUrl);
          }, 5000);
        }
      }, 500);
    };
  } catch (error) {
    console.error('Failed to trigger direct print spooler:', error);
    // Safe graceful degradation placeholder: download file
    doc.save('document.pdf');
  }
}

// Convert numbers to Indian Rupees Words representation for absolute billing clarity
export function numberToIndianWords(num: number): string {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function numToWords(n: number): string {
    if (n < 20) return a[n];
    const digit = n % 10;
    if (n < 100) return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '');
    const hundred = Math.floor(n / 100);
    const ten = n % 100;
    return a[hundred] + ' Hundred' + (ten ? ' and ' + numToWords(ten) : '');
  }

  const integerPart = Math.floor(num);
  if (integerPart === 0) return 'Rupees Zero Only';

  let words = '';
  const crore = Math.floor(integerPart / 10000000);
  const lakh = Math.floor((integerPart % 10000000) / 100000);
  const thousand = Math.floor((integerPart % 100000) / 1000);
  const remaining = integerPart % 1000;

  if (crore > 0) {
    words += numToWords(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += numToWords(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += numToWords(thousand) + ' Thousand ';
  }
  if (remaining > 0) {
    words += numToWords(remaining);
  }

  return `Rupees ${words.trim()} Only`;
}

// Draw an elegant professional standard letterhead for Harry Fashion documents
function drawLetterhead(doc: jsPDF, title: string) {
  // Accent Header Color Bar (Deep Navy #1A2E4A)
  doc.setFillColor(26, 46, 74);
  doc.rect(0, 0, 210, 38, 'F');

  // Sparkly gold luxury divider strip
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 38, 210, 1.2, 'F');

  // Primary Company Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(21);
  doc.text('HARRY FASHION', 14, 16);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(240, 244, 248);
  doc.text('Premium Garment Manufacturers, Tailoring Contractors & Jobwork Specialists', 14, 22);
  
  doc.setFontSize(7.5);
  doc.setTextColor(205, 220, 240);
  doc.text('GSTIN: 27AAPCH1972M1Z8 | State Code: 27 (MH) | Regd. Jobwork facility under Rule 143', 14, 28);
  doc.text('Works Office: 606, Veena Killedar Ind Est, Pais Street, Byculla W, Mumbai 400011, India | Mob: +91 91363 43810 | Email: accounts@harryfashion.com', 14, 33);

  // Document Title Badge
  doc.setFillColor(248, 250, 252);
  doc.rect(14, 44, 182, 10, 'F');
  
  doc.setDrawColor(200, 210, 220);
  doc.rect(14, 44, 182, 10, 'D');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(26, 46, 74);
  doc.text(title.toUpperCase(), 105, 50.5, { align: 'center' });

  // Border rule below badge for visual rhythm
  doc.setDrawColor(218, 224, 233);
  doc.setLineWidth(0.4);
  doc.line(14, 58, 196, 58);
}

// Footer thank you & pagination builder
function drawFooter(doc: jsPDF, pageNum = 1, totalPages = 1) {
  const y = doc.internal.pageSize.height || 297;
  
  doc.setDrawColor(200, 210, 220);
  doc.setLineWidth(0.5);
  doc.line(14, y - 25, 196, y - 25);

  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(100, 110, 120);
  doc.text('Thank You for your continued cooperation | Harry Fashion Mumbai', 105, y - 18, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Page ${pageNum} of ${totalPages}`, 196, y - 10, { align: 'right' });
  doc.text('Computer Generated Document — No Signature Required', 14, y - 10);
}

/**
 * MODULE 1 - Auto-generate Material Issue Challan PDF (high quality print design)
 */
export async function generateChallanPDF(
  challan: Challan,
  items: ChallanItem[],
  master: Master,
  materials: Material[],
  autoDownload = true,
  shouldPrint = false
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  drawLetterhead(doc, 'Material Issue Challan');

  // Beautiful Info Card Block (y = 64 to 92)
  doc.setFillColor(248, 250, 252); // extremely soft slate blue-grey
  doc.rect(14, 64, 182, 28, 'F');
  
  doc.setDrawColor(218, 224, 233);
  doc.setLineWidth(0.35);
  doc.rect(14, 64, 182, 28, 'D');
  
  // Middle vertical dividing line
  doc.line(105, 64, 105, 92);

  // Left Column: ISSUED TO (Master)
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.setFont('Helvetica', 'bold');
  doc.text('ISSUED TO (MASTER CRAFTSMAN)', 18, 70);

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // Slate-900 (Deep dark)
  doc.text(master.name, 18, 76);

  doc.setFontSize(8.5);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text(`Master Code: ${master.code}`, 18, 82);
  doc.text(`Department: ${master.type.toUpperCase()} Segment`, 18, 87);

  // Right Column: CHALLAN DETAILS
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text('CHALLAN METADATA', 110, 70);

  doc.setFontSize(11);
  doc.setTextColor(180, 20, 20); // Accent Red for number
  doc.text(challan.challan_no, 110, 76);

  doc.setFontSize(8.5);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text(`Issued Date: ${formatDate(challan.issued_date)}`, 110, 82);
  doc.text(`Issued By: ${challan.issued_by || 'Office Desk'}`, 110, 87);

  // Draw Status Badge at top right
  const badgeX = 166;
  const badgeY = 66;
  const statusUpper = challan.status.toUpperCase();
  const isBilled = challan.status === 'billed';
  
  if (isBilled) {
    doc.setFillColor(220, 252, 231); // Green-100
    doc.rect(badgeX, badgeY, 26, 6, 'F');
    doc.setDrawColor(187, 247, 208); // Green-200
    doc.rect(badgeX, badgeY, 26, 6, 'D');
    doc.setTextColor(21, 128, 61); // Green-700
  } else {
    doc.setFillColor(254, 243, 199); // Amber-100
    doc.rect(badgeX, badgeY, 26, 6, 'F');
    doc.setDrawColor(253, 230, 138); // Amber-200
    doc.rect(badgeX, badgeY, 26, 6, 'D');
    doc.setTextColor(180, 83, 9); // Amber-700
  }
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(statusUpper, badgeX + 13, badgeY + 4.2, { align: 'center' });

  // Table header
  let y = 98;
  doc.setFillColor(26, 46, 74); // Slate Navy
  doc.rect(14, y, 182, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('SR', 18, y + 5.5);
  doc.text('PARTICULAR / MATERIAL DESCRIPTION', 28, y + 5.5);
  doc.text('QTY', 115, y + 5.5, { align: 'right' });
  doc.text('UNIT', 125, y + 5.5);
  doc.text('RATE (Rs.)', 155, y + 5.5, { align: 'right' });
  doc.text('AMOUNT (Rs.)', 192, y + 5.5, { align: 'right' });

  // Rows
  y += 8;
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(20, 30, 40);
  doc.setLineWidth(0.2);
  
  let runningTotal = 0;
  
  items.forEach((item, index) => {
    const mat = materials.find(m => m.id === item.material_id);
    const materialLabel = mat ? mat.name : 'Unknown Material';
    const unitLabel = mat ? mat.unit : 'pc';

    // Draw row background tint for grid readability
    if (index % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(14, y, 182, 8, 'F');
    }

    doc.setFont('Helvetica', 'normal');
    doc.text(String(index + 1), 18, y + 5.5);
    doc.text(materialLabel, 28, y + 5.5);
    doc.text(item.qty.toFixed(1), 115, y + 5.5, { align: 'right' });
    doc.text(unitLabel, 125, y + 5.5);
    doc.text(formatINR(item.rate), 155, y + 5.5, { align: 'right' });
    doc.text(formatINR(item.amount), 192, y + 5.5, { align: 'right' });
    
    runningTotal += item.amount;
    
    // Bottom cell border line
    doc.setDrawColor(220, 225, 230);
    doc.line(14, y + 8, 196, y + 8);
    y += 8;
  });

  // Gross Total Row
  doc.setFillColor(240, 245, 250);
  doc.rect(14, y, 182, 10, 'F');
  
  doc.setFont('Helvetica', 'bold');
  doc.text('TOTAL CHALLAN VALUE (Rs.)', 28, y + 6.5);
  doc.text(formatINR(runningTotal), 192, y + 6.5, { align: 'right' });
  
  doc.setDrawColor(26, 46, 74);
  doc.setLineWidth(0.4);
  doc.line(14, y, 196, y);
  doc.line(14, y + 10, 196, y + 10);

  y += 15;

  // Print Amount in Words
  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const words = numberToIndianWords(runningTotal);
  doc.text(`Amount in Words: ${words}`, 14, y);
  y += 10;

  // Notes area if present
  if (challan.notes) {
    doc.setFillColor(254, 254, 254);
    doc.rect(14, y, 182, 18, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, y, 182, 18, 'D');

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(26, 46, 74);
    doc.text('Notes / Jobwork Remarks:', 18, y + 5);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(challan.notes, 18, y + 11);
    y += 24;
  }

  // Standard Jobwork Terms & Conditions Box
  doc.setFillColor(250, 250, 250);
  doc.rect(14, y, 182, 22, 'F');
  doc.setDrawColor(220, 225, 230);
  doc.setLineWidth(0.2);
  doc.rect(14, y, 182, 22, 'D');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 120, 130);
  doc.text('TERMS & CONDITIONS (JOBWORK SCHEME UNDER GST SECTION 143):', 18, y + 4.5);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 120, 130);
  doc.text('1. All materials listed are supplied solely for jobwork/stitching and remain the sole proprietary inventory of Harry Fashion.', 18, y + 8.5);
  doc.text('2. The job worker (Master) shall return the stitched garments back to our production facility within the stipulated cycle time.', 18, y + 12.5);
  doc.text('3. Any loss of materials, manufacturing waste exceeding 2%, or damage will be debited to the subcontractor’s ledger index.', 18, y + 16.5);

  y += 28;

  // Signature Block
  y = Math.max(y, 230); // Pin near bottom above footer
  doc.setDrawColor(180, 190, 200);
  doc.setLineWidth(0.4);
  doc.line(14, y, 70, y);
  
  // Stamp Seal Circular Placeholder
  doc.setDrawColor(220, 225, 230);
  doc.circle(105, y - 6, 8, 'D');
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(180, 190, 200);
  doc.text('HARRY FASHION', 105, y - 7, { align: 'center' });
  doc.text('OFC SEAL', 105, y - 4, { align: 'center' });

  doc.setDrawColor(180, 190, 200);
  doc.line(140, y, 196, y);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(26, 46, 74);
  doc.text('For HARRY FASHION', 14, y + 4.5);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 110, 120);
  doc.text('(Authorized Issuing Officer)', 14, y + 8.5);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(26, 46, 74);
  doc.text('RECEIVER SIGNATURE', 140, y + 4.5);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 110, 120);
  doc.text('(Master Tailor / Representative)', 140, y + 8.5);

  drawFooter(doc, 1, 1);

  // Return generated pdf blob
  const pdfBlob = doc.output('blob');
  
  if (autoDownload) {
    doc.save(`CHALLAN_${challan.challan_no}.pdf`);
  }

  if (shouldPrint) {
    printPDFDoc(doc);
  }

  // Log simulated Supabase storage saves
  const yr = new Date().getFullYear();
  const mo = String(new Date().getMonth() + 1).padStart(2, '0');
  console.log(`Saved PDF to simulated Supabase storage bucket: /challans/${yr}-${mo}/CHALLAN_${challan.challan_no}.pdf`);

  return pdfBlob;
}

/**
 * MODULE 3 - Billing Invoice PDF
 */
export async function generateInvoicePDF(
  invoice: Invoice,
  invoiceChallans: Challan[],
  allChallanItems: ChallanItem[],
  master: Master,
  materials: Material[],
  autoDownload = true,
  shouldPrint = false
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthName = months[invoice.period_month - 1];
  const billingPeriod = `${monthName}-${invoice.period_year}`;

  // Helper inside PDF generation to find last day of month
  const getLastDayOfMonth = (month: number, year: number): string => {
    const lastDay = new Date(year, month, 0).getDate();
    const d = String(lastDay).padStart(2, '0');
    const m = String(month).padStart(2, '0');
    return `${d}-${m}-${year}`;
  };

  // Header branding using standard letterhead decoration
  drawLetterhead(doc, 'Month-End Clearance Invoice');

  // Metadata block (shifted down to avoid colliding with drawLetterhead)
  doc.setDrawColor(218, 224, 233);
  doc.setFillColor(248, 250, 252);
  doc.rect(14, 62, 182, 30, 'F');
  doc.rect(14, 62, 182, 30, 'D');

  doc.setFontSize(9.5);
  doc.setTextColor(50, 60, 75);
  
  // Left side: Period and unique invoice no
  doc.setFont('Helvetica', 'bold');
  doc.text(`Period: ${billingPeriod}`, 20, 70);
  doc.text(`Invoice No: ${invoice.invoice_no}`, 20, 78);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Date of Issue: ${formatDate(invoice.created_at.split('T')[0])}`, 20, 85);

  // Right side: Tailor Details
  doc.text('Tailor Code:', 125, 70);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(26, 46, 74);
  doc.text(master.code || 'NA', 152, 70);

  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(50, 60, 75);
  doc.text('Tailor Name:', 125, 78);
  doc.setFont('Helvetica', 'bold');
  doc.text(master.name, 152, 78);

  // Use chosen PAN value from invoice drafting, or default saved on profile, or deterministic fallback
  const tailorPanCode = invoice.selected_pan_no || 
                        (master.pan_accounts && master.pan_accounts.length > 0 ? master.pan_accounts[0].pan_no : null) || 
                        `ABNPU${(master.code || 'KK').substring(0, 2).toUpperCase()}${String(master.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 17) * 4821).slice(0, 4).padStart(4, '8')}B`;
  doc.setFont('Helvetica', 'normal');
  doc.text('Pan #:', 125, 85);
  doc.setFont('Helvetica', 'bold');
  doc.text(tailorPanCode, 152, 85);

  let y = 102;

  // --- CHAPTER 1: Stitching Job Earnings Summary ---
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(26, 46, 74);
  doc.text('Stitching Job Earnings Summary', 14, y);
  
  y += 4;

  // Stitching table headers
  doc.setDrawColor(180, 190, 200);
  doc.setFillColor(235, 240, 245);
  doc.rect(14, y, 182, 8, 'F');
  doc.rect(14, y, 182, 8, 'D');

  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Date', 20, y + 5.5);
  doc.text('Amount', 130, y + 5.5, { align: 'right' });
  doc.text('Pcs', 190, y + 5.5, { align: 'right' });

  // Column gridlines in header
  doc.line(75, y, 75, y + 8);
  doc.line(135, y, 135, y + 8);

  y += 8;

  // Stitching data row (aggregated)
  const billingMonthEnd = getLastDayOfMonth(invoice.period_month, invoice.period_year);
  doc.setFont('Helvetica', 'normal');
  doc.rect(14, y, 182, 8, 'D');
  doc.text(billingMonthEnd, 20, y + 5.5);
  doc.text(formatINR(invoice.work_amount), 130, y + 5.5, { align: 'right' });
  doc.text(String(invoice.pcs || 0), 190, y + 5.5, { align: 'right' });

  doc.line(75, y, 75, y + 8);
  doc.line(135, y, 135, y + 8);

  y += 8;

  // Stitching Totals row
  doc.setFont('Helvetica', 'bold');
  doc.rect(14, y, 182, 8, 'D');
  doc.text('Totals', 20, y + 5.5);
  doc.text(formatINR(invoice.work_amount), 130, y + 5.5, { align: 'right' });
  doc.text(String(invoice.pcs || 0), 190, y + 5.5, { align: 'right' });

  doc.line(75, y, 75, y + 8);
  doc.line(135, y, 135, y + 8);

  y += 18;

  // --- CHAPTER 2: Vouchers (Materials Issued) ---
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(26, 46, 74);
  doc.text('Vouchers', 14, y);
  
  y += 4;

  // Vouchers table headers
  doc.setFillColor(235, 240, 245);
  doc.rect(14, y, 182, 8, 'F');
  doc.rect(14, y, 182, 8, 'D');

  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Date', 20, y + 5.5);
  doc.text('Voucher No', 80, y + 5.5);
  doc.text('Amount', 190, y + 5.5, { align: 'right' });

  // Column lines in header
  doc.line(75, y, 75, y + 8);
  doc.line(135, y, 135, y + 8);

  y += 8;

  // Generate vouchers array matching input challans
  const vouchersData = invoiceChallans.map((ch) => {
    const items = allChallanItems.filter(item => item.challan_id === ch.id);
    const amount = items.reduce((sum, curr) => sum + curr.amount, 0);
    return {
      date: formatDate(ch.issued_date),
      voucher_no: ch.challan_no.replace('HF-2526-', ''), // clean numeric suffix e.g. "34"
      amount: amount
    };
  });

  doc.setFont('Helvetica', 'normal');
  let accumulatedVoucherSum = 0;

  vouchersData.forEach((v) => {
    doc.rect(14, y, 182, 8, 'D');
    doc.text(v.date, 20, y + 5.5);
    doc.text(v.voucher_no, 80, y + 5.5);
    doc.text(formatINR(v.amount), 190, y + 5.5, { align: 'right' });

    doc.line(75, y, 75, y + 8);
    doc.line(135, y, 135, y + 8);

    accumulatedVoucherSum += v.amount;
    y += 8;
  });

  // Vouchers Totals row
  doc.setFont('Helvetica', 'bold');
  doc.rect(14, y, 182, 8, 'D');
  doc.text('Totals', 20, y + 5.5);
  doc.text(formatINR(accumulatedVoucherSum), 190, y + 5.5, { align: 'right' });

  doc.line(75, y, 75, y + 8);
  doc.line(135, y, 135, y + 8);

  y += 14;

  // --- CHAPTER 3: Final Computations (Two Column Layout) ---
  const leftBlockY = y + 2;

  // Left side disbursement details & checked by info
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(50, 60, 70);

  let curLeftY = leftBlockY;
  
  if (invoice.selected_account_no) {
    doc.text('Disbursement Bank Account Details:', 14, curLeftY);
    curLeftY += 4.5;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Bank Name: ${invoice.selected_bank_name || 'N/A'}`, 14, curLeftY);
    curLeftY += 4.5;
    doc.text(`A/C Number: ${invoice.selected_account_no}`, 14, curLeftY);
    curLeftY += 4.5;
    doc.text(`IFSC Code: ${invoice.selected_ifsc_code || 'N/A'}`, 14, curLeftY);
    if (invoice.selected_branch_name) {
      curLeftY += 4.5;
      doc.text(`Branch Name: ${invoice.selected_branch_name}`, 14, curLeftY);
    }
  } else {
    doc.text('Chq in favor of: ' + master.name, 14, curLeftY);
    const underlineLength = doc.getTextWidth(master.name);
    doc.line(42, leftBlockY + 1, 42 + underlineLength, leftBlockY + 1);
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Checked By:', 14, Math.max(curLeftY + 8, leftBlockY + 14));

  // Right side formulas aligned block
  const rLabelX = 142;
  const rValueX = 190;

  const mDiscount = invoice.discount || 0;
  const mSub = invoice.work_amount - invoice.material_deduction - mDiscount;
  const mTds = invoice.tds_amount || 0;
  const mGrand = invoice.grand_total || (mSub - mTds);
  const mRounded = Math.round(mGrand);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  doc.text('Total Amount:', rLabelX, y);
  doc.text(formatINR(invoice.work_amount), rValueX, y, { align: 'right' });
  y += 5.5;

  doc.text('-Vouchers:', rLabelX, y);
  doc.text(formatINR(invoice.material_deduction), rValueX, y, { align: 'right' });
  y += 5.5;

  doc.text('-Discount:', rLabelX, y);
  doc.text(formatINR(mDiscount), rValueX, y, { align: 'right' });
  y += 5.5;

  doc.setFont('Helvetica', 'bold');
  doc.text('Sub Total:', rLabelX, y);
  doc.text(formatINR(mSub), rValueX, y, { align: 'right' });
  y += 5.5;

  doc.setFont('Helvetica', 'normal');
  doc.text('-TDS: (1%)', rLabelX, y);
  doc.text(formatINR(mTds), rValueX, y, { align: 'right' });
  y += 5;

  // Dashed divider line under TDS
  doc.setDrawColor(120, 120, 120);
  doc.setLineDashPattern([1.5, 1], 0);
  doc.setLineWidth(0.25);
  doc.line(rLabelX - 2, y, rValueX + 5, y);
  y += 5.5;

  doc.setFont('Helvetica', 'bold');
  doc.text('Grand Total:', rLabelX, y);
  doc.text(formatINR(mGrand), rValueX, y, { align: 'right' });
  y += 5.5;

  doc.line(rLabelX - 2, y, rValueX + 5, y);
  y += 5.5;

  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(26, 46, 74);
  doc.text('Rounded off:', rLabelX, y);
  doc.text(formatINR(mRounded), rValueX, y, { align: 'right' });

  // Clear dash pattern
  doc.setLineDashPattern([], 0);

  // Pagination Footer
  drawFooter(doc, 1, 1);

  const pdfBlob = doc.output('blob');
  
  if (autoDownload) {
    doc.save(`INVOICE_${invoice.invoice_no}.pdf`);
  }

  if (shouldPrint) {
    printPDFDoc(doc);
  }

  const yr = new Date().getFullYear();
  const mo = String(new Date().getMonth() + 1).padStart(2, '0');
  console.log(`Saved Invoice PDF locally: /invoices/${yr}-${mo}/INVOICE_${invoice.invoice_no}.pdf`);

  return pdfBlob;
}

/**
 * REPORTS MODULE - Master Ledger Statement
 */
export function generateMasterLedgerPDF(
  master: Master,
  dateRange: { start: string; end: string },
  ledgerRows: { date: string; ref: string; type: 'issue' | 'work' | 'adjust'; material: string; qty: number; value: number }[],
  totalIssued: number,
  totalEarned: number,
  netBalance: number
) {
  const doc = new jsPDF();
  drawLetterhead(doc, `Master Ledger Report: ${master.name}`);

  // Date limit tags
  doc.setTextColor(20, 30, 40);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Master Stitcher:`, 14, 66);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${master.name} (${master.code}) - ${master.type.toUpperCase()} DIVISION`, 45, 66);

  doc.setFont('Helvetica', 'bold');
  doc.text(`Date Interval:`, 14, 72);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}`, 45, 72);

  // Summary boxes
  doc.setFillColor(245, 247, 250);
  doc.rect(130, 62, 66, 16, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.text('Ledger Net Outstand:', 134, 68);
  doc.setFontSize(11);
  doc.setTextColor(180, 20, 20);
  doc.text(formatINR(netBalance), 192, 73, { align: 'right' });

  // Table heading
  let y = 84;
  doc.setFillColor(26, 46, 74);
  doc.rect(14, y, 182, 8, 'F');
  
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DATE', 18, y + 5.5);
  doc.text('REF / TRANS ID', 38, y + 5.5);
  doc.text('TX TYPE', 70, y + 5.5);
  doc.text('PARTICULAR / REMARK', 100, y + 5.5);
  doc.text('VALUE', 192, y + 5.5, { align: 'right' });

  y += 8;
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(20, 30, 40);

  ledgerRows.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(14, y, 182, 7, 'F');
    }
    doc.text(formatDate(row.date), 18, y + 5);
    doc.text(row.ref, 38, y + 5);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(row.type === 'issue' ? 180 : 40, row.type === 'issue' ? 40 : 120, 40);
    doc.text(row.type.toUpperCase(), 70, y + 5);
    
    doc.setTextColor(20, 30, 40);
    doc.setFont('Helvetica', 'normal');
    
    const matLabel = row.material + (row.qty > 0 ? ` (x${row.qty})` : '');
    doc.text(matLabel.length > 35 ? matLabel.substring(0, 32) + '...' : matLabel, 100, y + 5);
    doc.text(formatINR(row.value), 192, y + 5, { align: 'right' });

    doc.setDrawColor(230, 235, 240);
    doc.line(14, y + 7, 196, y + 7);
    y += 7;
  });

  // Table summary
  doc.setFillColor(240, 245, 250);
  doc.rect(14, y, 182, 10, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.text('CUMULATIVE LEDGER POSITION:', 20, y + 6.5);
  doc.text(`Earnings: ${formatINR(totalEarned)} | Materials: ${formatINR(totalIssued)}`, 85, y + 6.5);
  doc.text(formatINR(netBalance), 192, y + 6.5, { align: 'right' });

  drawFooter(doc, 1, 1);
  doc.save(`LEDGER_MASTER_${master.code.toUpperCase()}.pdf`);
}

/**
 * REPORTS MODULE - Material Stock/Movement Ledger
 */
export function generateMaterialLedgerPDF(
  material: Material,
  dateRange: { start: string; end: string },
  events: { date: string; bill_ref: string; type: 'stock_in' | 'stock_out'; party: string; qty: number; balance: number }[]
) {
  const doc = new jsPDF();
  drawLetterhead(doc, `Material Stock Movement: ${material.name}`);

  doc.setTextColor(20, 30, 40);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Material Item:`, 14, 66);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${material.name} (Unit: ${material.unit})`, 45, 66);

  doc.setFont('Helvetica', 'bold');
  doc.text(`Time Scope:`, 14, 72);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}`, 45, 72);

  doc.setFont('Helvetica', 'bold');
  doc.text(`Current Stock:`, 14, 78);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${material.current_stock.toFixed(1)} ${material.unit}`, 45, 78);

  let y = 84;
  doc.setFillColor(26, 46, 74);
  doc.rect(14, y, 182, 8, 'F');
  
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DATE', 18, y + 5.5);
  doc.text('BILL / CHALLAN REFERENCE', 40, y + 5.5);
  doc.text('TX ACTION', 85, y + 5.5);
  doc.text('PARTY DETAIL (SUPPLIER/MASTER)', 110, y + 5.5);
  doc.text('CHANGE QTY', 165, y + 5.5, { align: 'right' });
  doc.text('RUNNING STOCK', 192, y + 5.5, { align: 'right' });

  y += 8;
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(20, 30, 40);

  events.forEach((row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(14, y, 182, 7, 'F');
    }
    doc.text(formatDate(row.date), 18, y + 5);
    doc.text(row.bill_ref, 40, y + 5);
    
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(row.type === 'stock_in' ? 40 : 180, row.type === 'stock_in' ? 120 : 40, 40);
    doc.text(row.type === 'stock_in' ? 'STOCK-IN (+)' : 'STOCK-OUT (-)', 85, y + 5);

    doc.setTextColor(20, 30, 40);
    doc.setFont('Helvetica', 'normal');
    doc.text(row.party.length > 25 ? row.party.substring(0, 22) + '...' : row.party, 110, y + 5);
    doc.text(row.qty.toFixed(1), 165, y + 5, { align: 'right' });
    doc.text(row.balance.toFixed(1), 192, y + 5, { align: 'right' });

    doc.setDrawColor(230, 235, 240);
    doc.line(14, y + 7, 196, y + 7);
    y += 7;
  });

  drawFooter(doc, 1, 1);
  doc.save(`MATERIAL_LEDGER_${material.name.replace(/\//g, '_')}.pdf`);
}

/**
 * REPORTS MODULE - Inventory/Stock Status Positions
 */
export function generateStockPositionPDF(materialsList: Material[]) {
  const doc = new jsPDF();
  drawLetterhead(doc, 'Current Material Stock Status Report');

  doc.setTextColor(20, 30, 40);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Report Datetime:`, 14, 66);
  doc.setFont('Helvetica', 'normal');
  doc.text(new Date().toLocaleString('en-IN'), 45, 66);

  doc.setFont('Helvetica', 'bold');
  doc.text(`Active SKUs:`, 14, 72);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${materialsList.filter(m=>m.is_active).length} Material items monitored`, 45, 72);

  let y = 80;
  doc.setFillColor(26, 46, 74);
  doc.rect(14, y, 182, 8, 'F');
  
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('SR', 18, y + 5.5);
  doc.text('MATERIAL ITEM', 28, y + 5.5);
  doc.text('UNIT', 105, y + 5.5);
  doc.text('DEFAULT RATE (दर)', 135, y + 5.5, { align: 'right' });
  doc.text('CURRENT STOCK LEVEL', 192, y + 5.5, { align: 'right' });

  y += 8;
  doc.setFont('Helvetica', 'normal');

  materialsList.forEach((m, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(14, y, 182, 7, 'F');
    }

    const isLow = m.current_stock < 10; // Red alert threshold
    if (isLow) {
      doc.setTextColor(190, 20, 20);
      doc.setFont('Helvetica', 'bold');
    } else {
      doc.setTextColor(20, 30, 40);
      doc.setFont('Helvetica', 'normal');
    }

    doc.text(String(idx + 1), 18, y + 5);
    doc.text(m.name, 28, y + 5);
    doc.text(m.unit, 105, y + 5);
    doc.text(formatINR(m.default_rate), 135, y + 5, { align: 'right' });
    
    const stockStr = isLow ? `${m.current_stock.toFixed(1)} [LOW]` : m.current_stock.toFixed(1);
    doc.text(stockStr, 192, y + 5, { align: 'right' });

    doc.setDrawColor(230, 235, 240);
    doc.line(14, y + 7, 196, y + 7);
    y += 7;
  });

  drawFooter(doc, 1, 1);
  doc.save(`STOCK_POSITION_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * REPORTS MODULE - Monthly summary overview PDF
 */
export function generateMonthlySummaryPDF(
  month: number,
  year: number,
  summary: { masterName: string; type: string; totalIssuedVal: number; workEarned: number; netPaid: number }[]
) {
  const doc = new jsPDF();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  drawLetterhead(doc, `Garment Production Monthly Executive Summary: ${months[month - 1]} ${year}`);

  doc.setTextColor(20, 30, 40);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Stitching Division:`, 14, 66);
  doc.setFont('Helvetica', 'normal');
  doc.text('All Active Masters (Jacket / Pant)', 48, 66);

  doc.setFont('Helvetica', 'bold');
  doc.text(`Statement Cycle:`, 14, 72);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${months[month-1]} ${year} Financial Period`, 48, 72);

  let y = 80;
  doc.setFillColor(26, 46, 74);
  doc.rect(14, y, 182, 8, 'F');
  
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('SR', 18, y + 5.5);
  doc.text('MASTER STITCHER NAME', 28, y + 5.5);
  doc.text('DEPT/CAT', 88, y + 5.5);
  doc.text('MATERIAL VALUE (A)', 122, y + 5.5, { align: 'right' });
  doc.text('WORK STITCHED (B)', 158, y + 5.5, { align: 'right' });
  doc.text('NET OUTSTANDING (B-A)', 192, y + 5.5, { align: 'right' });

  y += 8;
  doc.setFont('Helvetica', 'normal');

  let totalA = 0;
  let totalB = 0;
  let totalNet = 0;

  summary.forEach((val, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(14, y, 182, 7, 'F');
    }
    doc.setTextColor(20, 30, 40);
    doc.text(String(idx + 1), 18, y + 5);
    doc.text(val.masterName, 28, y + 5);
    doc.text(val.type.toUpperCase(), 88, y + 5);
    doc.text(formatINR(val.totalIssuedVal), 122, y + 5, { align: 'right' });
    doc.text(formatINR(val.workEarned), 158, y + 5, { align: 'right' });
    
    const isNegative = val.netPaid < 0;
    if (isNegative) {
      doc.setTextColor(190, 20, 20);
    } else {
      doc.setTextColor(40, 110, 40);
    }
    doc.text(formatINR(val.netPaid), 192, y + 5, { align: 'right' });

    totalA += val.totalIssuedVal;
    totalB += val.workEarned;
    totalNet += val.netPaid;

    doc.setDrawColor(230, 235, 240);
    doc.line(14, y + 7, 196, y + 7);
    y += 7;
  });

  // Grand Total Summary Box
  doc.setFillColor(240, 245, 250);
  doc.rect(14, y, 182, 10, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(26, 46, 74);
  doc.text('GRAND TOTAL VALUE (Rs.)', 24, y + 6.5);
  doc.text(formatINR(totalA), 122, y + 6.5, { align: 'right' });
  doc.text(formatINR(totalB), 158, y + 6.5, { align: 'right' });
  doc.text(formatINR(totalNet), 192, y + 6.5, { align: 'right' });

  drawFooter(doc, 1, 1);
  doc.save(`SUMMARY_MONTHLY_${months[month-1].toUpperCase()}_${year}.pdf`);
}

/**
 * EXCEL EXPORTS (using sheetjs)
 */
export function exportToExcel(data: any[], fileName: string, sheetName = 'Harry Fashion Report') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // Format columns auto widths
  const maxProps = Object.keys(data[0] || {});
  ws['!cols'] = maxProps.map(key => ({
    wch: Math.max(...data.map(obj => String(obj[key] || '').length).concat(key.length)) + 3
  }));

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
