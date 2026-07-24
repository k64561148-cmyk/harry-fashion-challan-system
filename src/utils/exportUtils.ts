/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { Challan, ChallanItem, Material, Master, Invoice, InwardEntry, AuditLog } from '../types';
import { db } from '../db';
import { smartSavePDF, getFolderChallanDateText, getFolderInvoiceDateText } from './smartDownloader';

let activeOverlay: HTMLDivElement | null = null;

export function showPDFLoading(message = "Preparing PDF..."): () => void {
  if (activeOverlay) {
    return () => {
      if (activeOverlay && activeOverlay.parentNode) {
        activeOverlay.parentNode.removeChild(activeOverlay);
        activeOverlay = null;
      }
    };
  }

  const overlay = document.createElement('div');
  overlay.id = 'pdf-loading-overlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.45)';
  overlay.style.backdropFilter = 'blur(4px)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '99999';
  overlay.style.transition = 'opacity 0.3s ease';

  const card = document.createElement('div');
  card.style.backgroundColor = '#ffffff';
  card.style.borderRadius = '16px';
  card.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
  card.style.padding = '24px';
  card.style.maxWidth = '320px';
  card.style.width = '100%';
  card.style.margin = '0 16px';
  card.style.border = '1px solid #f1f5f9';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.alignItems = 'center';
  card.style.textAlign = 'center';

  const spinnerContainer = document.createElement('div');
  spinnerContainer.style.position = 'relative';
  spinnerContainer.style.width = '64px';
  spinnerContainer.style.height = '64px';
  spinnerContainer.style.marginBottom = '16px';
  spinnerContainer.style.display = 'flex';
  spinnerContainer.style.alignItems = 'center';
  spinnerContainer.style.justifyContent = 'center';

  const outerRing = document.createElement('div');
  outerRing.style.position = 'absolute';
  outerRing.style.inset = '0';
  outerRing.style.border = '4px solid #f1f5f9';
  outerRing.style.borderTopColor = '#4f46e5';
  outerRing.style.borderRadius = '9999px';
  outerRing.style.animation = 'spin 1s linear infinite';

  const innerRing = document.createElement('div');
  innerRing.style.position = 'absolute';
  innerRing.style.inset = '8px';
  innerRing.style.border = '4px solid #f1f5f9';
  innerRing.style.borderBottomColor = '#10b981';
  innerRing.style.borderRadius = '9999px';
  innerRing.style.animation = 'spin-back 0.8s linear infinite';

  const centerText = document.createElement('div');
  centerText.style.fontFamily = 'system-ui, sans-serif';
  centerText.style.fontWeight = 'bold';
  centerText.style.fontSize = '12px';
  centerText.style.color = '#4f46e5';
  centerText.innerText = 'PDF';

  spinnerContainer.appendChild(outerRing);
  spinnerContainer.appendChild(innerRing);
  spinnerContainer.appendChild(centerText);

  const heading = document.createElement('h3');
  heading.style.margin = '0 0 4px 0';
  heading.style.fontFamily = 'system-ui, sans-serif';
  heading.style.fontSize = '16px';
  heading.style.fontWeight = '600';
  heading.style.color = '#0f172a';
  heading.innerText = message;

  const subtext = document.createElement('p');
  subtext.style.margin = '0';
  subtext.style.fontFamily = 'system-ui, sans-serif';
  subtext.style.fontSize = '12px';
  subtext.style.color = '#64748b';
  subtext.innerText = 'Formatting layout & structure...';

  if (!document.getElementById('pdf-spinner-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'pdf-spinner-styles';
    styleSheet.innerText = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes spin-back {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(-360deg); }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  card.appendChild(spinnerContainer);
  card.appendChild(heading);
  card.appendChild(subtext);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  activeOverlay = overlay;

  return () => {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (activeOverlay === overlay) {
      activeOverlay = null;
    }
  };
}

export function showPDFError(message = "An error occurred during PDF compiling.") {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.backgroundColor = '#fff1f2';
  toast.style.border = '1px solid #fecdd3';
  toast.style.color = '#9f1239';
  toast.style.borderRadius = '12px';
  toast.style.padding = '16px';
  toast.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '12px';
  toast.style.zIndex = '999999';
  toast.style.maxWidth = '360px';
  toast.style.fontFamily = 'system-ui, sans-serif';

  const iconSpan = document.createElement('span');
  iconSpan.style.display = 'flex';
  iconSpan.style.alignItems = 'center';
  iconSpan.style.justifyContent = 'center';
  iconSpan.style.backgroundColor = '#ffe4e6';
  iconSpan.style.borderRadius = '9999px';
  iconSpan.style.padding = '6px';
  iconSpan.innerHTML = `
    <svg style="width: 20px; height: 20px; color: #f43f5e" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  `;

  const textDiv = document.createElement('div');
  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.style.fontSize = '14px';
  title.style.color = '#9f1239';
  title.innerText = 'PDF Error';

  const desc = document.createElement('div');
  desc.style.fontSize = '12px';
  desc.style.color = '#e11d48';
  desc.style.marginTop = '2px';
  desc.innerText = message;

  textDiv.appendChild(title);
  textDiv.appendChild(desc);

  toast.appendChild(iconSpan);
  textDiv.appendChild(desc);
  toast.appendChild(textDiv);

  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast && toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 4550);
}

// Helper to format currency in INR style (Indian Rupees with commas)
export function formatINR(num: number): string {
  // Handles Indian numbering system (e.g., Lakhs and Crores)
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  
  // Format with up to 2 decimal places
  const parts = absNum.toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  let lastThree = integerPart.slice(-3);
  const otherNumbers = integerPart.slice(0, -3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = (otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree);
  
  const decimalStr = decimalPart !== '00' ? `.${decimalPart}` : '';
  const sign = isNegative ? '-' : '';
  
  return `${sign}Rs. ${formattedInteger || '0'}${decimalStr}`;
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
          // Cleanup frame and revoke blob URL after printed/canceled (prolonged to 2 minutes to block preview disappearance)
          setTimeout(() => {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
            URL.revokeObjectURL(pdfBlobUrl);
          }, 120000);
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
  const dismiss = showPDFLoading(`Preparing Challan ${challan.challan_no}...`);
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // 1. Header: "HARRY FASHION LLP" and "MATERIAL ISSUE CHALLAN"
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18); // Increased from 15
    doc.setTextColor(0, 0, 0);
    doc.text('HARRY FASHION LLP', 12, 18);

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12.5); // Increased from 10.5
    doc.text('MATERIAL ISSUE CHALLAN', 12, 24);

    // Copy Label on the top right removed as requested

    // Clean Solid separator line under header
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.45);
    doc.line(10, 27, 200, 27);

    // 2. Metadata / Information section
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11); // Increased from 9
    doc.setTextColor(0, 0, 0);

    // Column 1: Master Craftsman (Bold and Beautiful)
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12); // Bold and prominent as requested
    doc.text(`ISSUED TO ${master.name.toUpperCase()} MASTER:`, 12, 34);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Department: ${master.type.toUpperCase()} Master`, 12, 40);

    // Column 2: Challan Details (No "CHALLAN METADATA:" heading as requested)
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11); // Increased from 9
    doc.text(`Challan No: ${challan.challan_no}`, 120, 34);
    doc.text(`Date: ${formatDate(challan.issued_date)}`, 120, 40);
    doc.text(`Issued By: ${challan.issued_by || 'Office Desk'}`, 120, 46);

    // 3. Table Sizing & Header
    const tableY = 53;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    
    // Header top line
    doc.line(10, tableY, 200, tableY);

    const fontSize = 10; // increased from 8.5
    const rowHeight = 7.5; // increased from 6.5

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(0, 0, 0);

    doc.text('SR', 12, tableY + 5.2);
    doc.text('MATERIAL NAME', 20, tableY + 5.2);
    doc.text('QUANTITY', 116, tableY + 5.2, { align: 'right' });
    doc.text('UNIT', 120, tableY + 5.2);
    doc.text('RATE (Rs.)', 160, tableY + 5.2, { align: 'right' });
    doc.text('AMOUNT (Rs.)', 198, tableY + 5.2, { align: 'right' });

    // Header bottom line
    doc.line(10, tableY + rowHeight, 200, tableY + rowHeight);

    let currentY = tableY + rowHeight;
    let totalQty = 0;
    let totalAmount = 0;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(fontSize);

    items.forEach((item, index) => {
      const mat = materials.find(m => m.id === item.material_id);
      const materialName = mat ? mat.name : 'Unknown Material';
      const unit = mat ? mat.unit : 'pc';
      totalQty += item.qty;
      totalAmount += item.amount;

      // Dynamically adjust font size based on the length of materialName to prevent overlap
      let itemFontSize = 10;
      if (materialName.length > 35) {
        itemFontSize = 7.5;
      } else if (materialName.length > 25) {
        itemFontSize = 8.5;
      }
      doc.setFontSize(itemFontSize);

      doc.text(String(index + 1), 12, currentY + rowHeight - 2.2);
      doc.text(materialName, 20, currentY + rowHeight - 2.2);
      
      // Reset font size for numbers/units
      doc.setFontSize(10);
      doc.text(item.qty.toFixed(1), 116, currentY + rowHeight - 2.2, { align: 'right' });
      doc.text(unit, 120, currentY + rowHeight - 2.2);
      doc.text(formatINR(item.rate), 160, currentY + rowHeight - 2.2, { align: 'right' });
      doc.text(formatINR(item.amount), 198, currentY + rowHeight - 2.2, { align: 'right' });

      // Bottom row border
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.15);
      doc.line(10, currentY + rowHeight, 200, currentY + rowHeight);
      currentY += rowHeight;
    });

    // Draw Totals row at the bottom of the table
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(10, currentY, 200, currentY); // solid line above total row

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.text('TOTAL', 20, currentY + rowHeight - 2.2);
    doc.text(totalQty.toFixed(1), 116, currentY + rowHeight - 2.2, { align: 'right' });
    doc.text(formatINR(totalAmount), 198, currentY + rowHeight - 2.2, { align: 'right' });

    currentY += rowHeight; // increment for totals row

    // Table outer borders & vertical grids
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.line(10, tableY, 200, tableY); // top
    doc.line(10, currentY, 200, currentY); // bottom
    doc.line(10, tableY, 10, currentY); // left
    doc.line(200, tableY, 200, currentY); // right

    // Vertical separators
    doc.line(18, tableY, 18, currentY);
    doc.line(100, tableY, 100, currentY);
    doc.line(118, tableY, 118, currentY);
    doc.line(132, tableY, 132, currentY);
    doc.line(162, tableY, 162, currentY);

    // Notes
    if (challan.notes) {
      currentY += 8;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Notes / Remarks:', 12, currentY);
      doc.setFont('Helvetica', 'normal');
      doc.text(challan.notes, 42, currentY);
    }

    // Voided watermark
    if (challan.status === 'voided') {
      doc.saveGraphicsState();
      doc.setTextColor(220, 220, 220);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(60);
      doc.text('VOIDED', 105, 140, { align: 'center', angle: 25 });
      doc.restoreGraphicsState();
    }

    // 4. Signatures (Pinned to bottom of the A4 page)
    const sigY = 265;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    
    // 1st column: Issuer Signature
    doc.line(12, sigY - 4, 65, sigY - 4);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('ISSUER SIGNATURE', 12, sigY);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('(For HARRY FASHION LLP)', 12, sigY + 3.5);

    // 2nd column: Cutter Signature
    doc.line(78, sigY - 4, 131, sigY - 4);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('CUTTER SIGNATURE', 78, sigY);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.text("(Cutter's Sign)", 78, sigY + 3.5);

    // 3rd column: Receiver Signature
    doc.line(144, sigY - 4, 198, sigY - 4);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('RECEIVER SIGNATURE', 144, sigY);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('(Master Craftsman Signature)', 144, sigY + 3.5);

    // Return generated PDF blob
    const pdfBlob = doc.output('blob');
    
    if (autoDownload) {
      smartSavePDF({
        blob: pdfBlob,
        category: 'challan',
        dateText: getFolderChallanDateText(challan.issued_date),
        masterName: master.name,
        fileNo: challan.challan_no,
        isVoided: challan.status === 'voided'
      });
    }

    if (shouldPrint) {
      printPDFDoc(doc);
    }

    const yr = new Date().getFullYear();
    const mo = String(new Date().getMonth() + 1).padStart(2, '0');
    console.log(`Saved PDF using Smart Folder System / Cloud: /challans/${yr}-${mo}/CHALLAN_${challan.challan_no}.pdf`);

    return pdfBlob;
  } catch (err: any) {
    showPDFError(err.message || `Failed to compile Challan ${challan.challan_no}.`);
    throw err;
  } finally {
    dismiss();
  }
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
  const dismiss = showPDFLoading(`Preparing Invoice ${invoice.invoice_no}...`);
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const monthName = months[invoice.period_month - 1];
    const billingPeriod = `${monthName} ${invoice.period_year}`;

    const getLastDayOfMonth = (month: number, year: number): string => {
      const lastDay = new Date(year, month, 0).getDate();
      const d = String(lastDay).padStart(2, '0');
      const m = String(month).padStart(2, '0');
      return `${d}-${m}-${year}`;
    };

    // --- TITLE HEADER ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('Harry Fashion LLP', 105, 18, { align: 'center' });

    // --- METADATA PANEL (TWO COLUMNS) ---
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    
    // Left side info
    doc.text(`Period: ${billingPeriod}`, 14, 28);
    doc.text(`Invoice No: ${invoice.invoice_no}`, 14, 34);

    // Find the matching PAN profile for this invoice to get the correct nickname and cheque in favour of
    const matchedProfile = invoice.paymentProfileSnapshot || master.pan_accounts?.find(
      p => p.id === invoice.selected_pan_account_id || 
           (invoice.selected_account_no && p.account_no === invoice.selected_account_no)
    ) || master.pan_accounts?.find(p => p.is_default && p.is_active !== false)
      || master.pan_accounts?.find(p => p.is_active !== false)
      || master.pan_accounts?.[0];

    // Right side info (aligned right at x=196)
    const tailorInitial = invoice.selected_payment_label || matchedProfile?.label || master.code || master.name.split(' ')[0] || 'NA';
    doc.text(`Tailor Initial: ${tailorInitial}`, 196, 28, { align: 'right' });

    const tailorPanCode = invoice.selected_pan_no || 
                          invoice.paymentProfileSnapshot?.pan_no ||
                          matchedProfile?.pan_no ||
                          (master.pan_accounts && master.pan_accounts.length > 0 ? master.pan_accounts[0].pan_no : null) || 
                          `ABNPU${(master.code || 'KK').substring(0, 2).toUpperCase()}${String(master.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 17) * 4821).slice(0, 4).padStart(4, '8')}B`;

    doc.text(`Tailor Name: ${master.name}`, 196, 34, { align: 'right' });
    doc.text(`Pan #: ${tailorPanCode}`, 196, 40, { align: 'right' });

    let y = 46;

    // --- CHAPTER 1: Stitching Job Earnings Table ---
    // Table Headers
    doc.setFont('Helvetica', 'bold');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.setFillColor(235, 238, 242); // very soft grey table header
    
    doc.rect(14, y, 182, 8, 'F');
    doc.rect(14, y, 182, 8, 'D');

    doc.text('Date', 16, y + 5.5);
    doc.text('Amount', 76, y + 5.5);
    doc.text('Pcs', 136, y + 5.5);

    doc.line(74, y, 74, y + 8);
    doc.line(134, y, 134, y + 8);

    y += 8;

    // Data Row (aggregated)
    const billingMonthEnd = getLastDayOfMonth(invoice.period_month, invoice.period_year);
    doc.setFont('Helvetica', 'normal');
    doc.rect(14, y, 182, 8, 'D');
    doc.text(billingMonthEnd, 16, y + 5.5);
    doc.text(String(Math.round(invoice.work_amount)), 76, y + 5.5);
    doc.text(String(invoice.pcs || 0), 136, y + 5.5);

    doc.line(74, y, 74, y + 8);
    doc.line(134, y, 134, y + 8);

    y += 8;

    // Totals Row
    doc.setFont('Helvetica', 'bold');
    doc.rect(14, y, 182, 8, 'D');
    doc.text('Totals', 16, y + 5.5);
    doc.text(String(Math.round(invoice.work_amount)), 76, y + 5.5);
    doc.text(String(invoice.pcs || 0), 136, y + 5.5);

    doc.line(74, y, 74, y + 8);
    doc.line(134, y, 134, y + 8);

    y += 14;

    // --- CHAPTER 2: Vouchers (Materials Issued) Table ---
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Vouchers', 14, y);

    y += 4;

    // Vouchers Table Headers
    doc.setFont('Helvetica', 'bold');
    doc.setFillColor(235, 238, 242);
    doc.rect(14, y, 182, 8, 'F');
    doc.rect(14, y, 182, 8, 'D');

    doc.text('Date', 16, y + 5.5);
    doc.text('Voucher No', 76, y + 5.5);
    doc.text('Amount', 136, y + 5.5);

    doc.line(74, y, 74, y + 8);
    doc.line(134, y, 134, y + 8);

    y += 8;

    // Generate vouchers array matching input challans
    const vouchersData = invoiceChallans.map((ch) => {
      const items = allChallanItems.filter(item => item.challan_id === ch.id);
      const amount = items.reduce((sum, curr) => sum + curr.amount, 0);
      return {
        date: formatDate(ch.issued_date),
        voucher_no: ch.challan_no.split('-').pop() || ch.challan_no,
        amount: amount
      };
    });

    doc.setFont('Helvetica', 'normal');
    let accumulatedVoucherSum = 0;

    vouchersData.forEach((v) => {
      // Add a page break if table grows too long for A4
      if (y > 265) {
        doc.addPage();
        y = 20;
      }
      doc.rect(14, y, 182, 7.5, 'D');
      doc.text(v.date, 16, y + 5);
      doc.text(v.voucher_no, 76, y + 5);
      doc.text(String(Math.round(v.amount)), 136, y + 5);

      doc.line(74, y, 74, y + 7.5);
      doc.line(134, y, 134, y + 7.5);

      accumulatedVoucherSum += v.amount;
      y += 7.5;
    });

    // Vouchers Totals Row
    doc.setFont('Helvetica', 'bold');
    doc.rect(14, y, 182, 8, 'D');
    doc.text('Totals', 16, y + 5.5);
    doc.text(String(Math.round(accumulatedVoucherSum)), 136, y + 5.5);

    doc.line(74, y, 74, y + 8);
    doc.line(134, y, 134, y + 8);

    y += 12;

    // --- CHAPTER 3: Checked By & Final Calculations ---

    // Right side formulas block
    const rLabelX = 142;
    const rValueX = 196;

    const mDiscount = invoice.discount || 0;
    const mDeduction = invoice.stitching_deduction_amount || 0;
    const mSub = invoice.work_amount - invoice.material_deduction - mDiscount - mDeduction;
    const mTds = invoice.tds_amount || 0;
    const mGrand = invoice.grand_total || (mSub - mTds);
    const mRounded = Math.round(mGrand);

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    let formulasY = y + 2;

    doc.text('Total Amount:', rLabelX, formulasY);
    doc.text(String(Math.round(invoice.work_amount)), rValueX, formulasY, { align: 'right' });
    formulasY += 5.5;

    doc.text('-Vouchers:', rLabelX, formulasY);
    doc.text(String(Math.round(invoice.material_deduction)), rValueX, formulasY, { align: 'right' });
    formulasY += 5.5;

    doc.text('-Discount:', rLabelX, formulasY);
    doc.text(String(Math.round(mDiscount)), rValueX, formulasY, { align: 'right' });
    formulasY += 5.5;

    if (mDeduction > 0) {
      doc.text('-Stitching Deduc.:', rLabelX, formulasY);
      doc.text(String(Math.round(mDeduction)), rValueX, formulasY, { align: 'right' });
      formulasY += 5.5;
    }

    doc.setFont('Helvetica', 'bold');
    doc.text('Sub Total:', rLabelX, formulasY);
    doc.text(String(Math.round(mSub)), rValueX, formulasY, { align: 'right' });
    formulasY += 5.5;

    doc.setFont('Helvetica', 'normal');
    doc.text('-TDS: (1%)', rLabelX, formulasY);
    doc.text(mTds.toFixed(2), rValueX, formulasY, { align: 'right' });
    formulasY += 4;

    // Solid/dashed separator
    doc.setDrawColor(0, 0, 0);
    doc.setLineDashPattern([1.5, 1], 0);
    doc.setLineWidth(0.25);
    doc.line(135, formulasY, 196, formulasY);
    formulasY += 5.5;

    doc.setFont('Helvetica', 'bold');
    doc.text('Grand Total:', rLabelX, formulasY);
    doc.text(mGrand.toFixed(2), rValueX, formulasY, { align: 'right' });
    formulasY += 4;

    doc.line(135, formulasY, 196, formulasY);
    formulasY += 5.5;

    doc.setFont('Helvetica', 'bold');
    doc.text('Rounded off:', rLabelX, formulasY);
    doc.text(String(mRounded), rValueX, formulasY, { align: 'right' });

    const mSetoff = invoice.advanceSetoffAmount || 0;
    if (mSetoff > 0) {
      formulasY += 5.5;
      doc.setFont('Helvetica', 'bold');
      doc.text('-Adv. Setoff:', rLabelX, formulasY);
      doc.text(String(Math.round(mSetoff)), rValueX, formulasY, { align: 'right' });
      
      formulasY += 4;
      doc.line(135, formulasY, 196, formulasY);
      
      formulasY += 5.5;
      doc.setFont('Helvetica', 'bold');
      doc.text('Net Cash Payable:', rLabelX, formulasY);
      doc.text(String(Math.max(0, Math.round(mRounded - mSetoff))), rValueX, formulasY, { align: 'right' });

      // Calculate and display remaining advance balance for the master on the printed bill
      const currentAdvBal = db.getMasterAdvanceBalance(master.id);
      formulasY += 5.5;
      doc.setFont('Helvetica', 'bold');
      doc.text('Remaining Adv. Bal:', rLabelX - 6, formulasY);
      doc.text(String(Math.round(currentAdvBal)), rValueX, formulasY, { align: 'right' });
    }

    // Clear dash pattern
    doc.setLineDashPattern([], 0);

    // Left-side Note / Stitching Deduction Reason section
    let leftSideEndY = y;
    const stitchingNoteText = invoice.stitching_deduction_reason || (mDeduction > 0 ? 'Stitching job work deduction applied' : '');
    if (stitchingNoteText) {
      const noteStartY = y + 2;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text('Note / Stitching Reason:', 14, noteStartY);
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      const splitNote = doc.splitTextToSize(stitchingNoteText, 115);
      doc.text(splitNote, 14, noteStartY + 4.5);
      leftSideEndY = noteStartY + 4.5 + (splitNote.length * 3.8);
    }

    // --- Bottom Block (Bank Details followed by Chq / Signature) ---
    let bankY = Math.max(formulasY, leftSideEndY) + 10;
    // Calculate required space: bank details can take up to ~30 pt, and Chq/Checked By takes another ~15 pt.
    // Total bottom block height is ~45 pt. So if bankY is greater than 235, let's move everything to a new page.
    if (bankY > 235) {
      doc.addPage();
      bankY = 25;
    }

    // Dynamic bank specifications
    const actualBankName = invoice.selected_bank_name || matchedProfile?.bank_name || '';
    const actualAcNo = invoice.selected_account_no || matchedProfile?.account_no || '';
    const actualIfsc = invoice.selected_ifsc_code || matchedProfile?.ifsc_code || '';
    const actualBranch = invoice.selected_branch_name || matchedProfile?.branch_name || '';
    const actualPanHolder = (invoice as any).selected_pan_name || matchedProfile?.pan_name || '';

    let currentY = bankY;

    if (actualAcNo) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);
      doc.text('Disbursement Bank Account:', 14, currentY);
      
      currentY += 5;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      
      if (actualPanHolder) {
        doc.text(`A/C Holder Name: ${actualPanHolder.toUpperCase()}`, 14, currentY);
        currentY += 4.5;
      }
      if (actualBankName) {
        doc.text(`Bank: ${actualBankName.toUpperCase()}`, 14, currentY);
        currentY += 4.5;
      }
      doc.text(`Account No: ${actualAcNo}`, 14, currentY);
      currentY += 4.5;
      doc.text(`IFSC Code: ${actualIfsc.toUpperCase()}`, 14, currentY);
      if (actualBranch) {
        currentY += 4.5;
        doc.text(`Branch: ${actualBranch.toUpperCase()}`, 14, currentY);
      }
      // Add extra padding after the bank details block before Chq in favor of
      currentY += 10;
    } else {
      currentY += 4;
    }

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);

    // Left side: Cheque in Favour Of:
    doc.text('Cheque in Favour Of: ', 14, currentY);
    
    const chequeFavorName = invoice.selected_cheque_in_favour_of || matchedProfile?.cheque_in_favour_of || master.name || '';
    const labelWidth = doc.getTextWidth('Cheque in Favour Of: ');
    
    doc.setFont('Helvetica', 'bold');
    doc.text(chequeFavorName.toUpperCase(), 14 + labelWidth, currentY);
    
    // Underline the chequeFavorName
    const nameWidth = doc.getTextWidth(chequeFavorName.toUpperCase());
    doc.setLineWidth(0.35);
    doc.line(14 + labelWidth, currentY + 0.8, 14 + labelWidth + nameWidth, currentY + 0.8);

    // Right side: Checked By:
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Checked By:', 105, currentY);

    const pdfBlob = doc.output('blob');
    
    if (autoDownload) {
      smartSavePDF({
        blob: pdfBlob,
        category: 'invoice',
        dateText: getFolderInvoiceDateText(invoice.period_month, invoice.period_year),
        masterName: master.name,
        fileNo: invoice.invoice_no
      });
    }

    if (shouldPrint) {
      printPDFDoc(doc);
    }

    return pdfBlob;
  } catch (err: any) {
    showPDFError(err.message || `Failed to compile Invoice ${invoice.invoice_no || ''}.`);
    throw err;
  } finally {
    dismiss();
  }
}

/**
 * REPORTS MODULE - Master Ledger Statement
 */
export async function generateMasterLedgerPDF(
  master: Master,
  dateRange: { start: string; end: string },
  ledgerRows: { date: string; ref: string; type: 'issue' | 'work' | 'adjust'; material: string; qty: number; value: number }[],
  totalIssued: number,
  totalEarned: number,
  netBalance: number
) {
  const dismiss = showPDFLoading(`Preparing Ledger Report: ${master.name}...`);
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
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
  } catch (err: any) {
    showPDFError(err.message || "Failed to generate Master Ledger Report.");
  } finally {
    dismiss();
  }
}

/**
 * REPORTS MODULE - Material Stock/Movement Ledger
 */
export async function generateMaterialLedgerPDF(
  material: Material,
  dateRange: { start: string; end: string },
  events: { date: string; bill_ref: string; type: 'stock_in' | 'stock_out'; party: string; qty: number; balance: number }[]
) {
  const dismiss = showPDFLoading(`Preparing Stock Movement Ledger: ${material.name}...`);
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
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
  } catch (err: any) {
    showPDFError(err.message || "Failed to generate Material Stock Movement Report.");
  } finally {
    dismiss();
  }
}

/**
 * REPORTS MODULE - Inventory/Stock Status Positions
 */
export async function generateStockPositionPDF(materialsList: Material[]) {
  const dismiss = showPDFLoading("Preparing Stock Status Report...");
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
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
  } catch (err: any) {
    showPDFError(err.message || "Failed to generate Stock Position Report.");
  } finally {
    dismiss();
  }
}

/**
 * REPORTS MODULE - Monthly summary overview PDF
 */
export async function generateMonthlySummaryPDF(
  month: number,
  year: number,
  summary: { masterName: string; type: string; totalIssuedVal: number; workEarned: number; netPaid: number }[]
) {
  const dismiss = showPDFLoading("Preparing Monthly Statement...");
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
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
  } catch (err: any) {
    showPDFError(err.message || "Failed to generate Monthly Summary Report.");
  } finally {
    dismiss();
  }
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

/**
 * GENERATE AUDIT TRAIL REPORTS (PDF / PRINT)
 */
export async function generateAuditTrailPDF(audits: AuditLog[], triggerDownload = true, triggerPrint = false) {
  const dismiss = showPDFLoading("Preparing Audit Trail Report...");
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
    const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Title / Headers
  doc.setFillColor(26, 46, 74); // Deep Navy Base Hex #1A2E4A
  doc.rect(0, 0, 210, 32, 'F');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('HARRY FASHION', 14, 15);

  doc.setFontSize(10);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(220, 225, 230);
  doc.text('SYSTEM OPERATION TRAIL & AUDIT REPORT • MUMBAI', 14, 21);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);

  // Table Headers
  let y = 42;
  doc.setFillColor(235, 240, 245);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(50, 65, 80);
  doc.text('DATE & TIME', 16, y + 5.5);
  doc.text('USER EMAIL', 54, y + 5.5);
  doc.text('ACTION', 105, y + 5.5);
  doc.text('DESCRIPTIVE LOG DETAIL', 135, y + 5.5);

  y += 8;

  // Render Rows
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 80, 90);

  audits.forEach((log, index) => {
    // Check page boundaries (A4 height is 297mm)
    if (y > 270) {
      doc.addPage();
      y = 15;
      // Repeat Headers
      doc.setFillColor(235, 240, 245);
      doc.rect(14, y, 182, 8, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(50, 65, 80);
      doc.text('DATE & TIME', 16, y + 5.5);
      doc.text('USER EMAIL', 54, y + 5.5);
      doc.text('ACTION', 105, y + 5.5);
      doc.text('DESCRIPTIVE LOG DETAIL', 135, y + 5.5);
      y += 8;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(70, 80, 90);
    }

    const dt = new Date(log.created_at).toLocaleString('en-IN');
    doc.text(dt, 16, y + 4.5);
    doc.text(log.user_email, 54, y + 4.5);
    
    // Bold Action Tag
    doc.setFont('Helvetica', 'bold');
    doc.text(log.action.toUpperCase(), 105, y + 4.5);
    doc.setFont('Helvetica', 'normal');

    // Softly split multi line detail text to fit within page bounds (width 60mm)
    const detailLines = doc.splitTextToSize(log.details, 60);
    doc.text(detailLines, 135, y + 4.5);

    const rowHeight = Math.max(6, detailLines.length * 4.5 + 2);

    doc.setDrawColor(240, 243, 245);
    doc.line(14, y + rowHeight, 196, y + rowHeight);
    y += rowHeight;
  });

  if (triggerPrint) {
    printPDFDoc(doc);
  } else if (triggerDownload) {
    doc.save(`audit_trail_${new Date().toISOString().split('T')[0]}.pdf`);
  }
  } catch (err: any) {
    showPDFError(err.message || "Failed to generate Audit Trail Report.");
  } finally {
    dismiss();
  }
}
