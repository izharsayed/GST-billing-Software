import React, { useState, useEffect } from 'react';
import {
  X, Printer, Edit3, Eye, CheckCircle2, Save, FileText,
  Layers, AlertTriangle, ShieldCheck, Plus, Trash2, ArrowLeft, RefreshCw,
  Download, Loader2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { numberToWords } from '../../utils';
import { updateQuotationProposal } from '../../store';
import { toast } from '../Toast';

// Default 12 Excluded Works (Annexure III)
export const DEFAULT_EXCLUSIONS = [
  { id: 1, title: 'Electrical Power Supply', desc: 'Provision of 220V / 1-Phase / 50Hz and 415V / 3-Phase / 50Hz incoming power termination with a suitable independent MCB / Isolator within 1 meter of the condensing unit.' },
  { id: 2, title: 'Incoming Power up to Controller', desc: "Main incoming electrical power supply cabling, proper earthing, and terminating power up to the Cold Room Controller / Electric Control Panel is strictly under the Customer's scope & responsibility." },
  { id: 3, title: 'Voltage Regulation', desc: 'Supply and installation of suitable capacity dedicated servo voltage stabilizer to ensure steady input power supply.' },
  { id: 4, title: 'Civil Foundations', desc: 'Provision of flat concrete platform / foundation / MS structural stand and protective rain shades for outdoor condensing units.' },
  { id: 5, title: 'Internal Storage Accessories', desc: 'Provision of SS / MS storage racks, shelving systems, plastic pallets, and crates.' },
  { id: 6, title: 'Material Unloading & Shifting', desc: 'Safe unloading of the consignment at the site and manual shifting of PUF panels and heavy machinery from the delivery truck to the cold room floor.' },
  { id: 7, title: 'Structural & Civil Works', desc: 'All structural welding, civil masonry, room cutouts, core cutting, wall penetrations, and weatherproofing shades.' },
  { id: 8, title: 'Sub-Base Flooring', desc: 'Preparation of true 0-0 leveled PCC (Plain Cement Concrete) base floor for proper alignment and interlocking of PUF panels.' },
  { id: 9, title: 'Floor Finish', desc: 'Civil protective wearing layer (Kota stone, tiles, or reinforced concrete screed) over and above the supplied 40mm/80mm PUF floor slabs.' },
  { id: 10, title: 'Auxiliary Fixtures', desc: 'Air curtains, under-floor electrical heaters, impact bumper rails, centralized temperature data logging systems, and BMS communication interfacing.' },
  { id: 11, title: 'Condensate Drainage', desc: 'Provision of water drain trap pipelines with air breaks at discharge points nominated by our installation team.' },
  { id: 12, title: 'General', desc: 'Any specific item, utility, civil modification, or municipal clearance not expressly detailed in our scope of work shall be provided by the customer.' }
];

// Default 12 Contract Conditions (Annexure IV)
export const DEFAULT_TERMS = [
  { id: 1, title: 'Validity', text: 'Our offer remains valid for acceptance for a period of 30 days from the date of this proposal. Thereafter, prices shall be subject to written re-confirmation.' },
  { id: 2, title: 'Design Specifications', text: 'In line with continuous product development, we reserve the right to modify technical designs and equipment specifications where such modifications improve performance or comply with revised manufacturing standards.' },
  { id: 3, title: 'Duties & Customs', text: 'Rupee prices quoted include customs duty at currently prevalent tariff rates on assessable values.' },
  { id: 4, title: 'Taxes & Duties', text: 'Prices are exclusive of GST (18%). Any statutory tax variation by the Government at the time of invoicing will be billed on actuals. E-way bills to be provided by the customer where required.' },
  { id: 5, title: 'Price Basis', text: 'All prices are quoted in Indian Rupees (INR) on F.O.R. site basis as reflected in the price schedule.' },
  { id: 6, title: 'Delivery & Installation', text: 'Material delivery within 2 to 4 weeks upon receipt of confirmed PO, advance payment, and approved layouts. On-site installation requires 1 to 2 weeks following complete site handover.' },
  { id: 7, title: 'Payment Terms', text: '• Material Supply: 50% advance along with confirmed order, 50% prior to dispatch of material.\n• Installation: 50% advance before commencement of site work, 50% upon successful testing and commissioning.' },
  { id: 8, title: 'Warranty', text: 'Subject to agreed payment terms being fulfilled, the machinery carries a warranty against manufacturing defects for 24 months from installation or 27 months from date of supply, whichever is earlier. Defective components will be repaired/replaced at our discretion. This warranty excludes defects arising from electrical voltage fluctuations, physical misuse, normal wear & tear, corrosive atmospheres, or consumables (oil/refrigerant).' },
  { id: 9, title: 'Limitation of Liability', text: 'In no event shall the seller/contractor be liable for any consequential, indirect, or business losses arising from equipment downtime.' },
  { id: 10, title: 'Title & Lien', text: 'Title and property rights in the equipment remain with the seller until payment is received in full. We retain the right of lien and repossession on unpaid equipment.' },
  { id: 11, title: 'Cancellation', text: 'In the event of order cancellation by the customer, cancellation charges and compensation for all incurred expenses shall be recovered from the customer.' },
  { id: 12, title: 'Force Majeure', text: 'Neither party shall be held liable for failure or delays resulting from acts of God, strikes, pandemics, or events beyond reasonable operational control.' }
];

// Default 9 Engineering Specs (Annexure I)
export const DEFAULT_ENGINEERING_SPECS = [
  'Design Ambient: Engineered for peak ambient operating temperatures of up to {ambientTemp}°C.',
  'Sheet Lamination: Exposed & inner wall, partitions, and ceiling constructed of 0.5 mm Pre-Painted Galvanized Iron (PPGI) sheet for superior hygiene and corrosion resistance.',
  'Illumination: Includes industrial grade vapour-proof LED lighting fixtures designed for sub-zero temperatures.',
  'Panel Core: Rigid CFC-free High Density Polyurethane Foam (PUF) insulation (Density ~40±2 kg/m³). Thickness {panelThickness} for room thermal envelope.',
  'Hardware: Heavy-duty imported automatic self-closing hinges and door closers with built-in cylinder locks and key bypass.',
  'Internal Safety: Equipped with an internal luminous emergency release knob to enable easy exit even if the door is padlocked from outside.',
  'Hermetic / Scroll Condensing System: Matched heavy-duty air-cooled condensing units equipped with high-efficiency refrigeration compressors.',
  'Gasket Sealing: Bottom of door provided with continuous heavy sweeping rubber wiper gasket; tongue-and-groove cam locks across all wall, ceiling, and floor joins.',
  'Flooring System: 40 mm/80 mm high-density PUF insulation slabs supplied; civil finish / Kota stone on top is in customer scope.'
];

export const DEFAULT_FEATURES = [
  'VAPOUR PROOF LED LIGHT FIXTURES',
  'PUF SLAB FOR FLOORING',
  'INTERNAL SAFETY RELEASE LEVER',
  'HIGH EFFICIENCY SLIM EVAPORATORS',
  'SELF-CLOSING SWING TYPE FLUSH DOOR',
  'AIR-COOLED HERMETIC COMPRESSOR UNITS',
  'CAM-LOCK PANELS WITH HERMETIC GASKETS',
  'DIGITAL CONTROLLER & TEMPERATURE DISPLAY'
];

export default function TechnoCommercialProposalModal({
  isOpen,
  onClose,
  quotation,
  profile = {},
  onProposalSaved = null
}) {
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'customize'
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Initialize or generate proposal data
  const getInitialProposalData = () => {
    if (!quotation) return null;
    if (quotation?.proposal_data && typeof quotation.proposal_data === 'object' && Object.keys(quotation.proposal_data).length > 0) {
      const data = JSON.parse(JSON.stringify(quotation.proposal_data));
      if (!data.annexure_ii) data.annexure_ii = {};
      if ((!data.annexure_ii.items || data.annexure_ii.items.length <= 1) && quotation.items && quotation.items.length > 1) {
        data.annexure_ii.items = quotation.items.map(it => ({
          description: it.description || it.name || '',
          specs: it.specs || '',
          quantity: Number(it.quantity) || 1,
          unit: it.unit || 'Nos',
          unit_price: Number(it.rate || it.unit_price) || 0,
          total_amount: it.total_amount != null
            ? Number(it.total_amount)
            : (Number(it.quantity) || 1) * (Number(it.rate || it.unit_price) || 0)
        }));
      }
      return data;
    }

    const tech = quotation?.technicalInputs || {};
    const rec = quotation?.modelRecommendation || {};

    const appType = tech.application_type || tech.application || 'chiller';
    let appTitle = 'Walk-In Cold Room (Chiller Room)';
    let tempRange = '+2°C to +8°C';
    let panelThk = '80 mm PUF Panel';

    if (appType === 'freezer') {
      appTitle = 'Walk-In Blast / Holding Freezer Room';
      tempRange = '-18°C to -25°C';
      panelThk = '120 mm PUF Panel';
    } else if (appType === 'bmc') {
      appTitle = 'Bulk Milk Chilling (BMC) System';
      tempRange = '+4°C Direct Expansion';
      panelThk = '80 mm PUF Panel';
    } else if (tech.target_temp_c >= 12) {
      appTitle = 'Walk-In Cold Room (Fruit Ripening Room)';
      tempRange = `+${tech.target_temp_c || 14}°C to +18°C`;
      panelThk = '80 mm PUF Panel';
    }

    // Thermodynamic Engine Overrides
    if (tech.calculationEngine || tech.thermalBreakdown) {
      if (tech.puf?.thicknessMm) {
        panelThk = `${tech.puf.thicknessMm} mm PUF Panel (k = 0.023 W/m·K)`;
      }
      if (tech.commodity?.name) {
        appTitle = `Cold Storage for ${tech.commodity.name}`;
        tempRange = tech.commodity.storageTempRange || tempRange;
      }
    } else if (tech.pufThicknessMm) {
      panelThk = `${tech.pufThicknessMm} mm PUF Panel`;
    }

    // Dynamic Sizing & Dimensions (Option 1. A: 'As per Site Survey & Layout' when no sizer is used)
    const chambersCount = Number(tech.chambersCount || tech.numRooms || 1);
    let externalSizeStr = 'As per Site Survey & Layout';
    if (tech.dimensions?.lengthM) {
      externalSizeStr = `${tech.dimensions.lengthM}m × ${tech.dimensions.widthM}m × ${tech.dimensions.heightM}m${chambersCount > 1 ? ` (${chambersCount} Equal Chambers)` : ''}`;
    } else if (tech.length_ft && tech.width_ft && tech.height_ft) {
      externalSizeStr = `${tech.length_ft} Ft × ${tech.width_ft} Ft × ${tech.height_ft} Ft${chambersCount > 1 ? ` (${chambersCount} Equal Chambers)` : ''}`;
    } else if (tech.length && tech.width && tech.height) {
      externalSizeStr = `${tech.length} ${tech.unit || 'm'} × ${tech.width} ${tech.unit || 'm'} × ${tech.height} ${tech.unit || 'm'}`;
    }

    // Dynamic Capacity Calculation & Auto-Detection from Quote items
    let capacityStr = '';
    if (tech.machineRating?.capacityTr) {
      capacityStr = `${tech.machineRating.capacityTr} TR (${tech.machineRating.capacityKw} kW / ${tech.machineRating.capacityBtuHr?.toLocaleString('en-IN')} BTU/Hr)`;
    } else if (tech.calculated_load_tr || tech.capacityTr) {
      const trVal = Number(tech.calculated_load_tr || tech.capacityTr);
      const kwVal = Number(tech.calculated_load_kw || tech.estimatedLoadKw || (trVal * 3.517).toFixed(1));
      const btuVal = Math.round(trVal * 12000);
      capacityStr = `${trVal} TR (${kwVal} kW / ${btuVal.toLocaleString('en-IN')} BTU/Hr)`;
    } else if (tech.calculated_load_kw || tech.estimatedLoadKw) {
      const kwVal = Number(tech.calculated_load_kw || tech.estimatedLoadKw);
      const trVal = (kwVal / 3.517).toFixed(1);
      const btuVal = Math.round(kwVal * 3412.142);
      capacityStr = `${trVal} TR (${kwVal} kW / ${btuVal.toLocaleString('en-IN')} BTU/Hr)`;
    } else {
      // Auto-detect capacity directly from quotation items (e.g. "9.07 TR each, 2 Sets = 18.14 TR")
      let autoDetected = '';
      for (const itm of (quotation?.items || [])) {
        const desc = itm.description || itm.name || '';
        const trMatch = desc.match(/(\d+(?:\.\d+)?)\s*TR/i);
        if (trMatch) {
          const tr = parseFloat(trMatch[1]);
          const kw = (tr * 3.517).toFixed(1);
          const btu = Math.round(tr * 12000);
          autoDetected = `${tr} TR (${kw} kW / ${btu.toLocaleString('en-IN')} BTU/Hr)`;
          break;
        }
        const kwMatch = desc.match(/(\d+(?:\.\d+)?)\s*kW/i);
        if (kwMatch) {
          const kw = parseFloat(kwMatch[1]);
          const tr = (kw / 3.517).toFixed(1);
          const btu = Math.round(kw * 3412.142);
          autoDetected = `${tr} TR (${kw} kW / ${btu.toLocaleString('en-IN')} BTU/Hr)`;
          break;
        }
      }
      capacityStr = autoDetected || 'As per Matched Equipment Selection';
    }

    // Dynamic Door Specification (Option 2. C)
    const doorsCount = tech.doors?.totalDoors || chambersCount || 1;
    let doorLabel = 'Heavy-Duty Swing Flush Type (34" × 78")';
    if (tech.doors?.doorSpec) {
      doorLabel = tech.doors.doorSpec;
    } else if (tech.doorType === 'sliding' || (tech.door_spec && tech.door_spec.toLowerCase().includes('sliding'))) {
      doorLabel = 'Heavy-Duty Industrial Overlap / Sliding Door (1200mm × 2100mm)';
    } else if (tech.doorType === 'hatch' || (tech.door_spec && tech.door_spec.toLowerCase().includes('hatch'))) {
      doorLabel = 'Manual Flush Hatch Door / Reach-in Window (600mm × 600mm)';
    } else if (tech.door_spec && typeof tech.door_spec === 'string' && !tech.door_spec.includes('Nos.')) {
      doorLabel = tech.door_spec;
    }

    const doorSpecStr = tech.door_spec && tech.door_spec.includes('Nos.')
      ? tech.door_spec
      : (doorsCount > 1 ? `${doorsCount} Nos. ${doorLabel} (1 per Chamber)` : `1 No. ${doorLabel}`);

    const ambientVal = tech.ambient_temp_c || tech.ambientTemp || tech.temperatures?.ambientTempC || 43;
    const ambientStr = `${ambientVal}°C Design Ambient`;
    const roomTempVal = tech.room_temp || tech.target_temp_c || (tech.temperatures?.roomTempC !== undefined ? `${tech.temperatures.roomTempC}°C` : tempRange);
    const sheetMat = tech.sheetMaterial || tech.sheet_material || '0.5 mm PPGI (Inner & Outer)';

    // Equipment strings from quotation items or recommendations
    let cduStr = rec.catalogue_ref || 'Daikin / Emerson Air-Cooled Condensing Unit';
    let evapStr = 'High-Efficiency Slim IDU Evaporator with Fans';

    (quotation?.items || []).forEach(itm => {
      const desc = itm.description || '';
      if (desc.toLowerCase().includes('condensing unit') || desc.toLowerCase().includes('cdu')) {
        cduStr = desc;
      } else if (desc.toLowerCase().includes('evaporator') || desc.toLowerCase().includes('cooling unit') || desc.toLowerCase().includes('idu')) {
        evapStr = desc;
      }
    });

    return {
      // General & Transmittal
      subject: `Proposal for Supply & Installation of ${appTitle}`,
      kind_attn: quotation?.site_contact || quotation?.customer_name || 'Valued Customer',
      site_location: quotation?.site_address || quotation?.site_name || 'Site Facility',
      transmittal_body: `This is with reference to your subject requirement. As desired, we are pleased to submit our comprehensive techno-commercial proposal comprising the Supply & Installation of Pre-Fabricated PUF Insulated Panels along with Complete Refrigeration System for your facility.\n\nOur offer is detailed in the following annexures enclosed herewith for your kind perusal and evaluation:`,
      office_coordinates: `${profile.businessName || 'MIF REFRIGERATION'} • ${profile.city || 'Ahmednagar'}, ${profile.state || 'Maharashtra'}\nWorks & Services India`,

      // Annexure I: Technical Specifications
      annexure_i: {
        room_title: `${appTitle} (${roomTempVal})`,
        application: appTitle.replace('Walk-In ', ''),
        room_temp: roomTempVal,
        external_size: externalSizeStr,
        ambient_temp: ambientStr,
        panel_thickness: panelThk,
        refrigerant: `${tech.refrigerant_preference || tech.refrigerant || 'R-404A'} Eco-Friendly`,
        door_spec: doorSpecStr,
        refrigeration_capacity: capacityStr,
        condensing_unit: cduStr,
        evaporator_model: evapStr,
        sheet_material: sheetMat,
        features: [...DEFAULT_FEATURES],
        detailed_specs: DEFAULT_ENGINEERING_SPECS.map(s =>
          s.replace('{ambientTemp}', ambientVal).replace('{panelThickness}', panelThk)
        ),
      },

      // Annexure II: Commercial Schedule & Notes
      annexure_ii: {
        scope_config: 'Standard Cam Lock PUF Panels (0.5mm PPGI Sheet), Matched Air-Cooled Condensing Unit & High-Efficiency Evaporator Unit.',
        freight_status: 'INCLUSIVE',
        extra_piping_rate: 570,
        included_piping_ft: 10,
        items: (quotation?.items && quotation.items.length > 0)
          ? quotation.items.map(it => ({
              description: it.description || it.name || '',
              specs: it.specs || '',
              quantity: Number(it.quantity) || 1,
              unit: it.unit || 'Nos',
              unit_price: Number(it.rate || it.unit_price) || 0,
              total_amount: it.total_amount != null
                ? Number(it.total_amount)
                : (Number(it.quantity) || 1) * (Number(it.rate || it.unit_price) || 0)
            }))
          : [
              {
                description: appTitle,
                specs: `Temp: ${tempRange} • Size: ${externalSizeStr} • Panel: ${panelThk}`,
                quantity: 1,
                unit: 'Set',
                unit_price: (Number(quotation?.equipment_subtotal) || 0) + (Number(quotation?.charges_subtotal) || 0),
                total_amount: (Number(quotation?.equipment_subtotal) || 0) + (Number(quotation?.charges_subtotal) || 0)
              }
            ],
        pricing_notes: [
          'Panel construction: 0.5mm PPGI sheet on inner and outer sides of wall and ceiling panels.',
          'Ceiling mounted slim evaporator in stainless steel/powder coated casing included as per standard specifications.',
          'Flooring insulation: 40mm/80mm PUF slabs supplied. Kota stone finishing / civil casting is to be provided by customer.',
          'Quoted installation charges include copper piping, electric interconnecting cabling, refrigerant gas charging, insulation, and labour up to 3 meters (10 feet) per cold room.',
          'Any extra refrigerant copper piping required beyond 10 feet will be charged extra at ₹{extraRate} per Running Foot (RFT) + GST.',
          'Commercial Offer valid as per conditions in Annexure IV.'
        ],
      },

      // Annexure III: Excluded Works (12 Clauses)
      exclusions: DEFAULT_EXCLUSIONS.map(e => ({ ...e })),
      site_readiness: 'To prevent installation delays and idle labor charges, the client must ensure that 0-0 leveled flooring, clear entry access, adequate staging space, water, and temporary testing power are fully available before the mobilization of our erection team.',

      // Annexure IV: Conditions of Contract (12 Clauses)
      terms: DEFAULT_TERMS.map(t => ({ ...t })),
      client_acceptance_name: `${quotation?.customer_name || 'Client Representative'} / ${quotation?.company_name || 'Facility Owner'}`,
      heat_load_breakdown: tech.thermalBreakdown || null,
      machine_rating: tech.machineRating || null,
      commodity: tech.commodity || null,
      chambers: tech.chambers || null,
      doors: tech.doors || null,
      partitionWalls: tech.partitionWalls || null,
      totalPufSurfaceAreaM2: tech.totalPufSurfaceAreaM2 || tech.dimensions?.totalPufSurfaceAreaM2 || null,
    };
  };

  const [proposalData, setProposalData] = useState(() => getInitialProposalData());

  useEffect(() => {
    if (quotation) {
      setProposalData(getInitialProposalData());
    }
  }, [quotation]);

  if (!isOpen || !quotation || !proposalData) return null;

  // Financial calculations
  const basicCost = (Number(quotation.equipment_subtotal) || 0) + (Number(quotation.charges_subtotal) || 0);
  const grandTotal = Number(quotation.total_amount) || 0;
  const taxAmount = (Number(quotation.tax_amount) > 0)
    ? Number(quotation.tax_amount)
    : (grandTotal > basicCost ? grandTotal - basicCost : 0);
  const totalInWords = numberToWords(grandTotal);

  const displayItems = (proposalData.annexure_ii?.items && proposalData.annexure_ii.items.length > 0)
    ? proposalData.annexure_ii.items
    : (quotation?.items && quotation.items.length > 0)
      ? quotation.items
      : [
          {
            description: proposalData.annexure_i?.application || 'Walk-In Cold Storage System',
            specs: `Temp: ${proposalData.annexure_i?.room_temp || '+2°C'} • Size: ${proposalData.annexure_i?.external_size || ''} • Thk: ${proposalData.annexure_i?.panel_thickness || ''}`,
            quantity: 1,
            unit: 'Set',
            unit_price: basicCost,
            total_amount: basicCost
          }
        ];

  // Formatted date
  const displayDate = quotation.quotation_date
    ? new Date(quotation.quotation_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  // Save changes to backend
  const handleSaveProposal = async () => {
    setIsSaving(true);
    try {
      if (quotation?.id && !String(quotation.id).startsWith('draft') && !String(quotation.id).startsWith('live_invoice')) {
        try {
          await updateQuotationProposal(quotation.id, proposalData);
        } catch (apiErr) {
          console.warn('Backend proposal save note:', apiErr.message);
        }
      }
      toast('5-Page Proposal customizations saved successfully!', 'success');
      if (onProposalSaved) onProposalSaved(proposalData);
    } catch (err) {
      toast(err.message || 'Failed to save proposal changes', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 1. High-fidelity 5-Page Browser Print via isolated iframe
  const handlePrint = () => {
    const printEl = document.getElementById('proposal-print-container');
    if (!printEl) {
      toast('Print container not ready.', 'error');
      return;
    }

    const contentHtml = printEl.innerHTML;

    let iframe = document.getElementById('fgsb-proposal-print-frame');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'fgsb-proposal-print-frame';
      iframe.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:0;height:0;border:0;';
      document.body.appendChild(iframe);
    }

    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Proposal - ${(quotation.quotation_number || 'CER-CR').replace(/[\/\\]/g, '_')}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
      color: #0f172a !important;
      -webkit-font-smoothing: antialiased;
    }
    .proposal-page {
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      margin: 0 !important;
      padding: 8mm 12mm 10mm 12mm !important;
      min-height: 275mm !important;
      height: 275mm !important;
      box-sizing: border-box !important;
      box-shadow: none !important;
      border: none !important;
      background: #ffffff !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      overflow: hidden !important;
    }
    .proposal-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    table {
      border-collapse: collapse !important;
      width: 100% !important;
    }
    th, td {
      border-color: #cbd5e1 !important;
    }
    .no-print {
      display: none !important;
    }
  </style>
</head>
<body>
  ${contentHtml}
</body>
</html>`;

    const frameDoc = iframe.contentWindow.document;
    frameDoc.open();
    frameDoc.write(doc);
    frameDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('Iframe print error', err);
        window.print();
      }
    }, 300);
  };

  // 2. Direct 5-Page PDF File Download
  const handleDownloadPdf = async () => {
    const container = document.getElementById('proposal-print-container');
    if (!container) {
      toast('Proposal preview not loaded.', 'error');
      return;
    }

    const pages = container.querySelectorAll('.proposal-page');
    if (!pages || pages.length === 0) {
      toast('No proposal pages found to export.', 'error');
      return;
    }

    setIsGeneratingPdf(true);
    toast('Compiling 5-Page Proposal PDF...', 'info', 2500);

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pdfWidth = 210;
      const pdfHeight = 297;

      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];
        const canvas = await html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1024,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      const cleanNum = (quotation.quotation_number || 'CER-CR').replace(/[\/\\]/g, '_');
      pdf.save(`Proposal_${cleanNum}.pdf`);
      toast('5-Page Proposal PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('Proposal PDF export error:', err);
      toast('Failed to download PDF. You can also use "Print / Save as PDF".', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Intercept Ctrl+P inside the proposal modal to trigger clean 5-page iframe print
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  // Helper for Annexure I spec updates
  const updateAnnexureI = (field, val) => {
    setProposalData(prev => ({
      ...prev,
      annexure_i: {
        ...prev.annexure_i,
        [field]: val
      }
    }));
  };

  // Helper for exclusions update
  const updateExclusion = (index, field, val) => {
    setProposalData(prev => {
      const next = [...prev.exclusions];
      next[index] = { ...next[index], [field]: val };
      return { ...prev, exclusions: next };
    });
  };

  // Helper for terms update
  const updateTerm = (index, field, val) => {
    setProposalData(prev => {
      const next = [...prev.terms];
      next[index] = { ...next[index], [field]: val };
      return { ...prev, terms: next };
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '0.75rem',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: '#f8fafc', color: '#0f172a', borderRadius: 12, width: '100%', maxWidth: 'min(1180px, 96vw)', height: '94vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden'
      }}>
        {/* MODAL TOP TOOLBAR (HIDDEN IN PRINT) */}
        <div className="no-print" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap',
          padding: '0.65rem 1.25rem', background: '#0b2545', color: '#fff', borderBottom: '1px solid #1e3a5f', gap: '0.6rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flexShrink: 1 }}>
            <FileText size={18} style={{ color: '#38bdf8', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.98rem', letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>
                Techno-Commercial Project Proposal (5 Pages)
              </div>
              <div style={{ fontSize: '0.73rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Ref: {quotation.quotation_number} • {profile.businessName || 'MIF'} 4-Annexure Cold-Room Proposal
              </div>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.1)', padding: 3, borderRadius: 8, gap: 3, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: 'none',
                fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap',
                background: activeTab === 'preview' ? '#0284c7' : 'transparent',
                color: '#fff'
              }}
            >
              <Eye size={13} /> Preview (5-Page)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('customize')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 6, border: 'none',
                fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap',
                background: activeTab === 'customize' ? '#0284c7' : 'transparent',
                color: '#fff'
              }}
            >
              <Edit3 size={13} /> Customize Terms
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSaveProposal}
              disabled={isSaving || isGeneratingPdf}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '5px 10px',
                background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', whiteSpace: 'nowrap'
              }}
              title="Save custom changes to proposal annexures and terms"
            >
              <Save size={13} /> {isSaving ? 'Saving...' : 'Save Changes'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '5px 11px',
                background: '#047857', borderColor: '#059669', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap',
                cursor: isGeneratingPdf ? 'wait' : 'pointer'
              }}
              title="Directly compile and download complete 5-Page Proposal PDF file"
            >
              {isGeneratingPdf ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
              {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePrint}
              disabled={isGeneratingPdf}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '5px 11px',
                background: '#0284c7', borderColor: '#0284c7', color: '#fff', fontWeight: 600, whiteSpace: 'nowrap',
                cursor: 'pointer'
              }}
              title="Open browser print dialog (5 Pages A4 layout)"
            >
              <Printer size={13} /> Print / PDF
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer',
                padding: '4px 6px', display: 'flex', alignItems: 'center', borderRadius: 4, marginLeft: '0.2rem'
              }}
              title="Close Proposal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PRINT CSS INJECTION */}
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden; }
              #proposal-print-container, #proposal-print-container * { visibility: visible; }
              #proposal-print-container {
                position: absolute;
                left: 0;
                top: 0;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
              }
              .no-print { display: none !important; }
              .proposal-page {
                page-break-after: always !important;
                break-after: page !important;
                margin: 0 !important;
                padding: 12mm 15mm !important;
                min-height: 275mm !important;
                box-shadow: none !important;
                border: none !important;
                box-sizing: border-box !important;
              }
              @page {
                size: A4 portrait;
                margin: 8mm 10mm;
              }
            }
          `
        }} />

        {/* MODAL MAIN CONTENT AREA */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#e2e8f0', padding: '1.5rem 1rem' }}>
          {/* ========================================================= */}
          {/* TAB 1: 5-PAGE PRINT PREVIEW */}
          {/* ========================================================= */}
          <div
            id="proposal-print-container"
            style={activeTab === 'preview' ? {
              maxWidth: 840,
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2rem'
            } : {
              position: 'fixed',
              left: '-99999px',
              top: 0,
              width: '840px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2rem',
              pointerEvents: 'none',
              opacity: 0
            }}
          >
              
              {/* ------------------------------------------------------- */}
              {/* PAGE 1: FORMAL PROPOSAL COVER LETTER */}
              {/* ------------------------------------------------------- */}
              <div className="proposal-page" style={{
                background: '#fff', color: '#0f172a', padding: '2.5rem 3rem', borderRadius: 8,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', minHeight: 1120, display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', fontFamily: 'Segoe UI, Arial, sans-serif', boxSizing: 'border-box'
              }}>
                <div>
                  {/* Top Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #0284c7', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#0369a1', letterSpacing: '0.5px' }}>
                        {profile.businessName || 'MIF REFRIGERATION'}
                      </h1>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.2rem' }}>
                        {profile.tagline || 'EXCELLENCE IN INDUSTRIAL & COMMERCIAL COOLING SOLUTIONS'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.4rem', lineHeight: 1.4 }}>
                        {profile.address || 'Shop No 2, 3, Nagar Aurangabad Road, Opposite Sunni Palace'}, {profile.city || 'Ahmednagar'}, {profile.state || 'Maharashtra'} {profile.pin ? `– ${profile.pin}` : '– 414003'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 600, marginTop: '0.25rem' }}>
                        GSTIN: {profile.gstin || '27EVPPS2735J1ZU'} &nbsp;|&nbsp; Mob: {profile.phone || '+91 8381015527'}
                      </div>
                    </div>

                    {/* Reference / Date Box */}
                    <div style={{
                      border: '1.5px solid #cbd5e1', borderRadius: 6, padding: '0.6rem 0.9rem',
                      textAlign: 'center', background: '#f8fafc', minWidth: 150
                    }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Ref No:</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', margin: '0.1rem 0 0.4rem' }}>
                        {quotation.quotation_number || 'CER/CR-6856'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Date:</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                        {displayDate}
                      </div>
                    </div>
                  </div>

                  {/* Addressee / Client Block */}
                  <div style={{ background: '#f8fafc', borderLeft: '4px solid #0284c7', padding: '0.9rem 1.2rem', marginBottom: '1.5rem', borderRadius: '0 6px 6px 0' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>To,</div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                      {quotation.customer_name || 'Aurangabad, Maharashtra'}
                    </div>
                    {quotation.company_name && (
                      <div style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 600 }}>{quotation.company_name}</div>
                    )}
                    <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.2rem' }}>
                      <strong>Kind Attn:</strong> {proposalData.kind_attn}
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0369a1', marginTop: '0.4rem' }}>
                      <strong>Subject:</strong> {proposalData.subject}
                    </div>
                  </div>

                  {/* Transmittal Letter Body */}
                  <div style={{ fontSize: '0.88rem', lineHeight: 1.7, color: '#334155', marginBottom: '1.5rem' }}>
                    <p style={{ margin: '0 0 0.8rem', fontWeight: 600 }}>Dear Sir,</p>
                    <p style={{ margin: '0 0 0.8rem', whiteSpace: 'pre-line' }}>
                      {proposalData.transmittal_body}
                    </p>
                  </div>

                  {/* Annexure Overview Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ background: '#0b2545', color: '#fff' }}>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'left', width: 140, fontWeight: 700 }}>Annexure</th>
                        <th style={{ padding: '0.7rem 1rem', textAlign: 'left', fontWeight: 700 }}>Scope Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#0369a1' }}>Annexure I</td>
                        <td style={{ padding: '0.65rem 1rem', color: '#1e293b' }}>Basis of Design, Equipment Selection & Technical Specifications</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#0369a1' }}>Annexure II</td>
                        <td style={{ padding: '0.65rem 1rem', color: '#1e293b' }}>Schedule of Items, Bill of Quantities & Price Details</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#0369a1' }}>Annexure III</td>
                        <td style={{ padding: '0.65rem 1rem', color: '#1e293b' }}>Excluded Works and Services (Customer Scope of Work)</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#0369a1' }}>Annexure IV</td>
                        <td style={{ padding: '0.65rem 1rem', color: '#1e293b' }}>General Conditions of Contract, Payment Terms & Warranty Guidelines</td>
                      </tr>
                    </tbody>
                  </table>

                  <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
                    We trust you will find our offer competitive and strictly in line with your technical requirements. In case you require any further clarifications or engineering details, please feel free to contact us.
                  </p>
                  <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 2rem' }}>
                    Thanking you and assuring you of our best engineering services at all times.
                  </p>
                </div>

                {/* Page 1 Bottom Signatures */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>Office Coordinates:</div>
                      <div style={{ fontSize: '0.82rem', color: '#334155', whiteSpace: 'pre-line', marginTop: '0.2rem' }}>
                        {proposalData.office_coordinates}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                        For {profile.businessName || 'MIF REFRIGERATION'}
                      </div>
                      <div style={{ height: 45, borderBottom: '1px dashed #94a3b8', width: 220, margin: '0.5rem 0 0.3rem auto' }}></div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>Authorized Signatory</div>
                    </div>
                  </div>

                  {/* Page 1 Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: '1.5rem', paddingTop: '0.5rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                    <div>{profile.businessName || 'MIF Refrigeration'} • Ref: {quotation.quotation_number}</div>
                    <div>Offer for Walk-In Cold Rooms</div>
                    <div>Page 1 of 5</div>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* PAGE 2: ANNEXURE I — TECHNICAL SPECIFICATIONS */}
              {/* ------------------------------------------------------- */}
              <div className="proposal-page" style={{
                background: '#fff', color: '#0f172a', padding: '2.5rem 3rem', borderRadius: 8,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', minHeight: 1120, display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', fontFamily: 'Segoe UI, Arial, sans-serif', boxSizing: 'border-box'
              }}>
                <div>
                  {/* Page Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 700, color: '#0369a1' }}>
                      {profile.businessName || 'MIF REFRIGERATION'} <span style={{ color: '#64748b', fontWeight: 400 }}>{profile.city || 'Ahmednagar'} – {profile.pin || '414003'}</span>
                    </div>
                    <div style={{ color: '#64748b' }}>
                      Ref: <strong>{quotation.quotation_number}</strong> | Date: {displayDate}
                    </div>
                  </div>

                  {/* Section Title Banner */}
                  <div style={{
                    background: '#0b2545', color: '#fff', padding: '0.65rem 1rem', borderRadius: 4,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.5px' }}>
                      ANNEXURE – I : BASIS OF DESIGN AND TECHNICAL SPECIFICATIONS
                    </div>
                    <div style={{ fontSize: '0.82rem', background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                      {proposalData.annexure_i.room_title}
                    </div>
                  </div>

                  {/* 2-Column Parameter vs Specification Grid */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', width: '22%', fontWeight: 700 }}>Parameter</th>
                        <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', width: '28%', fontWeight: 700 }}>Specification</th>
                        <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', width: '22%', fontWeight: 700 }}>Parameter</th>
                        <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', width: '28%', fontWeight: 700 }}>Specification</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Application</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700 }}>{proposalData.annexure_i.application}</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Room Temp.</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#0284c7' }}>{proposalData.annexure_i.room_temp}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>External Size (L×W×H)</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700 }}>{proposalData.annexure_i.external_size}</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Ambient Temp.</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700 }}>{proposalData.annexure_i.ambient_temp}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Panel Thickness</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700 }}>{proposalData.annexure_i.panel_thickness}</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Refrigerant</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700 }}>{proposalData.annexure_i.refrigerant}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Door Type & Size</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700 }}>{proposalData.annexure_i.door_spec}</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Refrigeration Capacity</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#0369a1' }}>{proposalData.annexure_i.refrigeration_capacity}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Condensing Unit</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#b45309' }}>{proposalData.annexure_i.condensing_unit}</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Evaporator Model</td>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#0369a1' }}>{proposalData.annexure_i.evaporator_model}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600, color: '#475569' }}>Sheet Material</td>
                        <td colSpan={3} style={{ padding: '0.45rem 0.6rem', fontWeight: 700 }}>{proposalData.annexure_i.sheet_material}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Thermodynamic Heat Load Breakdown (ASHRAE / USDA Engine) */}
                  {proposalData.heat_load_breakdown && (() => {
                    const hlb = proposalData.heat_load_breakdown;
                    const mr = proposalData.machine_rating || {};
                    const com = proposalData.commodity || {};
                    return (
                      <div style={{
                        background: '#f8fafc',
                        border: '1.5px solid #0284c7',
                        borderRadius: 6,
                        padding: '0.6rem 0.8rem',
                        marginBottom: '1rem',
                        fontSize: '0.78rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', fontSize: '0.76rem', letterSpacing: '0.3px' }}>
                            Thermodynamic Heat Load Summary (ASHRAE / USDA Standards)
                          </span>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>
                            Stored: {com.name || 'Produce'} • Daily Inflow: {com.dailyMassKg || 8000} kg/day
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem', textAlign: 'center' }}>
                          <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                            <div style={{ color: '#64748b', fontSize: '0.68rem' }}>Q Transmission</div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{Math.round(hlb.qTransmissionKj / 1000)}k kJ</div>
                            <div style={{ color: '#0284c7', fontSize: '0.68rem', fontWeight: 600 }}>{hlb.breakdownPercentages?.transmission}%</div>
                          </div>
                          <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                            <div style={{ color: '#64748b', fontSize: '0.68rem' }}>Q Product Load</div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{Math.round(hlb.qProductKj / 1000)}k kJ</div>
                            <div style={{ color: '#0284c7', fontSize: '0.68rem', fontWeight: 600 }}>{hlb.breakdownPercentages?.product}%</div>
                          </div>
                          <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                            <div style={{ color: '#64748b', fontSize: '0.68rem' }}>Q Infiltration</div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{Math.round(hlb.qAirInfiltrationKj / 1000)}k kJ</div>
                            <div style={{ color: '#0284c7', fontSize: '0.68rem', fontWeight: 600 }}>{hlb.breakdownPercentages?.airInfiltration}%</div>
                          </div>
                          <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                            <div style={{ color: '#64748b', fontSize: '0.68rem' }}>Q Internal Load</div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{Math.round(hlb.qInternalKj / 1000)}k kJ</div>
                            <div style={{ color: '#0284c7', fontSize: '0.68rem', fontWeight: 600 }}>{hlb.breakdownPercentages?.internal}%</div>
                          </div>
                          <div style={{ background: '#fff', padding: '4px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                            <div style={{ color: '#64748b', fontSize: '0.68rem' }}>Q Equip / Defrost</div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{Math.round(hlb.qEquipmentKj / 1000)}k kJ</div>
                            <div style={{ color: '#0284c7', fontSize: '0.68rem', fontWeight: 600 }}>{hlb.breakdownPercentages?.equipment}%</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', paddingTop: '0.3rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.74rem' }}>
                          <span><strong>Total Daily Thermal Load:</strong> {Math.round(hlb.qTotalKj / 1000)}k kJ/day</span>
                          <span><strong>Run Target:</strong> {mr.runHours || 16} hrs/day (+10% Safety Factor)</span>
                          <span style={{ color: '#0369a1', fontWeight: 800 }}><strong>Selected Capacity:</strong> {mr.capacityTr} TR ({mr.capacityKw} kW)</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Multi-Chamber Room-Wise Breakdown Table */}
                  {proposalData.chambers && proposalData.chambers.length > 1 && (
                    <div style={{
                      background: '#fff',
                      border: '1.5px solid #0284c7',
                      borderRadius: 6,
                      marginBottom: '1rem',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        background: '#0b2545',
                        color: '#fff',
                        padding: '0.45rem 0.8rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>ROOM-WISE MULTI-CHAMBER PARTITIONING & DEDICATED EQUIPMENT</span>
                        <span style={{ fontSize: '0.7rem', color: '#93c5fd' }}>
                          {proposalData.chambers.length} Equal Chambers • {proposalData.doors?.totalDoors || proposalData.chambers.length} Doors • {proposalData.partitionWalls?.count || 0} Partition Walls ({proposalData.partitionWalls?.totalAreaM2 || 0} m²)
                        </span>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                            <th style={{ padding: '0.35rem 0.6rem', textAlign: 'left' }}>Chamber</th>
                            <th style={{ padding: '0.35rem 0.6rem', textAlign: 'center' }}>Dimensions (L×W×H)</th>
                            <th style={{ padding: '0.35rem 0.6rem', textAlign: 'center' }}>Volume</th>
                            <th style={{ padding: '0.35rem 0.6rem', textAlign: 'center' }}>Assigned Door</th>
                            <th style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>Heat Load</th>
                            <th style={{ padding: '0.35rem 0.6rem', textAlign: 'left' }}>Dedicated Evaporator</th>
                          </tr>
                        </thead>
                        <tbody>
                          {proposalData.chambers.map(ch => (
                            <tr key={ch.chamberNumber} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '0.4rem 0.6rem', fontWeight: 700, color: '#0369a1' }}>{ch.name}</td>
                              <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>{ch.dimensions.lengthM}m × {ch.dimensions.widthM}m × {ch.dimensions.heightM}m</td>
                              <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>{ch.dimensions.volumeM3} m³</td>
                              <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>1 Dedicated Swing Door</td>
                              <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontWeight: 700 }}>{ch.capacityTr} TR ({ch.capacityKw} kW)</td>
                              <td style={{ padding: '0.4rem 0.6rem', color: '#1e40af', fontWeight: 600 }}>
                                Daikin {ch.evaporator?.model_number || 'DX Unit'} ({ch.evaporator?.capacity_kw || ch.capacityKw} kW)
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Included Accessories Badges */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0b2545', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.3px' }}>
                      Accessories & Salient Features Included:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      {proposalData.annexure_i.features.map((feat, idx) => (
                        <div key={idx} style={{
                          background: '#f0f9ff', border: '1px solid #bae6fd', borderLeft: '3px solid #0284c7',
                          padding: '0.35rem 0.6rem', borderRadius: 4, fontSize: '0.74rem', fontWeight: 700, color: '#0369a1'
                        }}>
                          ■ &nbsp;{feat}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Detailed Engineering Specifications (9 Points) */}
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0b2545', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.3px' }}>
                      Detailed Engineering Specifications:
                    </div>
                    <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', lineHeight: 1.5, color: '#334155' }}>
                      {proposalData.annexure_i.detailed_specs.map((spec, sidx) => (
                        <li key={sidx} style={{ marginBottom: '0.35rem' }}>
                          {spec}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                {/* Page 2 Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: '1.5rem', paddingTop: '0.5rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                  <div>{profile.businessName || 'MIF Refrigeration'} • Ref: {quotation.quotation_number}</div>
                  <div>Annexure I: Technical Specifications</div>
                  <div>Page 2 of 5</div>
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* PAGE 3: ANNEXURE II — BILL OF QUANTITIES & COMMERCIALS */}
              {/* ------------------------------------------------------- */}
              <div className="proposal-page" style={{
                background: '#fff', color: '#0f172a', padding: '2.5rem 3rem', borderRadius: 8,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', minHeight: 1120, display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', fontFamily: 'Segoe UI, Arial, sans-serif', boxSizing: 'border-box'
              }}>
                <div>
                  {/* Page Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 700, color: '#0369a1' }}>
                      {profile.businessName || 'MIF REFRIGERATION'} <span style={{ color: '#64748b', fontWeight: 400 }}>{profile.city || 'Ahmednagar'} – {profile.pin || '414003'}</span>
                    </div>
                    <div style={{ color: '#64748b' }}>
                      Ref: <strong>{quotation.quotation_number}</strong> | Date: {displayDate}
                    </div>
                  </div>

                  {/* Section Banner */}
                  <div style={{
                    background: '#0b2545', color: '#fff', padding: '0.65rem 1rem', borderRadius: 4,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.5px' }}>
                      ANNEXURE – II : SCHEDULE OF ITEMS AND PRICE DETAILS
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#bae6fd' }}>
                      All Values in Indian Rupees (₹)
                    </div>
                  </div>

                  {/* Scope Configuration Subtitle */}
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '1rem', fontStyle: 'italic' }}>
                    <strong>Scope Configuration:</strong> {proposalData.annexure_ii.scope_config}
                  </div>

                  {/* Schedule of Items Table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.25rem', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ background: '#0b2545', color: '#fff' }}>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', width: 45 }}>Item</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Description & Technical Specs</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', width: 105 }}>Qty / Unit</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right', width: 130 }}>Rate (₹)</th>
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right', width: 150 }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map((item, idx) => {
                        const itmQty = Number(item.quantity) || 1;
                        const itmRate = Number(item.unit_price ?? item.rate) || 0;
                        const itmTotal = item.total_amount != null
                          ? Number(item.total_amount)
                          : (itmQty * itmRate);

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #cbd5e1', background: idx % 2 === 1 ? '#f8fafc' : '#fff' }}>
                            <td style={{ padding: '0.65rem 0.8rem', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                            <td style={{ padding: '0.65rem 0.8rem' }}>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.description || item.name}</div>
                              {item.specs && (
                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>{item.specs}</div>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem', textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                              {itmQty} {item.unit || 'Nos'}
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', color: '#475569' }}>
                              {itmRate > 0
                                ? itmRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : 'INCLUDED'}
                            </td>
                            <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              {itmTotal > 0
                                ? itmTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : 'INCLUDED'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Commercial Financial Calculation Box */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
                    <div style={{ width: 340, fontSize: '0.86rem', lineHeight: 1.9 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#475569' }}>Total Ex-Factory / Ex-Godown:</span>
                        <strong style={{ color: '#0f172a' }}>₹{basicCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#475569' }}>Total Basic Cost:</span>
                        <strong style={{ color: '#0f172a' }}>₹{basicCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#475569' }}>Freight / Transport:</span>
                        <strong style={{ color: '#0284c7' }}>{proposalData.annexure_ii.freight_status}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderTop: '1px solid #cbd5e1' }}>
                        <span style={{ color: '#475569' }}>Taxable Amount:</span>
                        <strong style={{ color: '#0f172a' }}>₹{basicCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#475569' }}>GST @ 18%:</span>
                        <strong style={{ color: '#0f172a' }}>₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', padding: '6px 8px', marginTop: '4px',
                        background: '#f0f9ff', border: '1.5px solid #0284c7', borderRadius: 4,
                        fontSize: '1.05rem', fontWeight: 800, color: '#0369a1'
                      }}>
                        <span>Grand Total:</span>
                        <span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Amount in Words */}
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.9rem', borderRadius: 4, border: '1px solid #e2e8f0', marginBottom: '1.25rem', fontSize: '0.82rem' }}>
                    <strong>Amount in Words:</strong> <span style={{ color: '#0f172a', fontWeight: 600 }}>{totalInWords}</span>
                  </div>

                  {/* Pricing Notes & Clarifications */}
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.85rem 1rem', background: '#fafafa', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0b2545', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.3px' }}>
                      Pricing Notes & Clarifications:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', lineHeight: 1.5, color: '#475569' }}>
                      {proposalData.annexure_ii.pricing_notes.map((note, nidx) => (
                        <li key={nidx} style={{ marginBottom: '0.25rem' }}>
                          {note.replace('{extraRate}', proposalData.annexure_ii.extra_piping_rate)}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', marginBottom: '1rem' }}>
                    Commercial Offer valid as per conditions in Annexure IV.
                  </div>
                </div>

                {/* Page 3 Bottom Signature */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                    <div style={{ textAlign: 'center', width: 220 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                        For {profile.businessName || 'MIF REFRIGERATION'}
                      </div>
                      <div style={{ height: 40, borderBottom: '1px dashed #94a3b8', margin: '0.5rem 0 0.3rem' }}></div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>Authorized Signatory</div>
                    </div>
                  </div>

                  {/* Page 3 Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: '1.5rem', paddingTop: '0.5rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                    <div>{profile.businessName || 'MIF Refrigeration'} • Ref: {quotation.quotation_number}</div>
                    <div>Annexure II: Schedule of Prices</div>
                    <div>Page 3 of 5</div>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* PAGE 4: ANNEXURE III — EXCLUDED WORKS & SERVICES */}
              {/* ------------------------------------------------------- */}
              <div className="proposal-page" style={{
                background: '#fff', color: '#0f172a', padding: '2.5rem 3rem', borderRadius: 8,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', minHeight: 1120, display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', fontFamily: 'Segoe UI, Arial, sans-serif', boxSizing: 'border-box'
              }}>
                <div>
                  {/* Page Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 700, color: '#0369a1' }}>
                      {profile.businessName || 'MIF REFRIGERATION'} <span style={{ color: '#64748b', fontWeight: 400 }}>{profile.city || 'Ahmednagar'} – {profile.pin || '414003'}</span>
                    </div>
                    <div style={{ color: '#64748b' }}>
                      Ref: <strong>{quotation.quotation_number}</strong> | Date: {displayDate}
                    </div>
                  </div>

                  {/* Section Title Banner */}
                  <div style={{
                    background: '#0b2545', color: '#fff', padding: '0.65rem 1rem', borderRadius: 4,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.5px' }}>
                      ANNEXURE – III : EXCLUDED WORKS AND SERVICES
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#bae6fd', fontWeight: 600 }}>
                      Customer Scope of Work
                    </div>
                  </div>

                  <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, margin: '0 0 1rem' }}>
                    The following works, utilities, structural provisions, and services are specifically <strong>excluded from our quoted price</strong> and shall be arranged by the client at their own cost prior to installation:
                  </p>

                  {/* 12 Exclusions List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.5rem' }}>
                    {proposalData.exclusions.map((item, idx) => (
                      <div key={item.id || idx} style={{ fontSize: '0.78rem', lineHeight: 1.45, color: '#334155' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{idx + 1}. {item.title}:</span> {item.desc}
                      </div>
                    ))}
                  </div>

                  {/* Site Readiness Requirement Highlight Card */}
                  <div style={{
                    background: '#fffbeb', border: '1.5px solid #f59e0b', borderLeft: '5px solid #d97706',
                    borderRadius: 6, padding: '0.85rem 1.1rem', marginTop: '1rem'
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', marginBottom: '0.3rem', letterSpacing: '0.3px' }}>
                      SITE READINESS REQUIREMENT:
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#78350f', lineHeight: 1.5 }}>
                      {proposalData.site_readiness}
                    </div>
                  </div>
                </div>

                {/* Page 4 Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: '1.5rem', paddingTop: '0.5rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                  <div>{profile.businessName || 'MIF Refrigeration'} • Ref: {quotation.quotation_number}</div>
                  <div>Annexure III: Excluded Works</div>
                  <div>Page 4 of 5</div>
                </div>
              </div>

              {/* ------------------------------------------------------- */}
              {/* PAGE 5: ANNEXURE IV — CONDITIONS OF CONTRACT */}
              {/* ------------------------------------------------------- */}
              <div className="proposal-page" style={{
                background: '#fff', color: '#0f172a', padding: '2.5rem 3rem', borderRadius: 8,
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', minHeight: 1120, display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', fontFamily: 'Segoe UI, Arial, sans-serif', boxSizing: 'border-box'
              }}>
                <div>
                  {/* Page Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 700, color: '#0369a1' }}>
                      {profile.businessName || 'MIF REFRIGERATION'} <span style={{ color: '#64748b', fontWeight: 400 }}>{profile.city || 'Ahmednagar'} – {profile.pin || '414003'}</span>
                    </div>
                    <div style={{ color: '#64748b' }}>
                      Ref: <strong>{quotation.quotation_number}</strong> | Date: {displayDate}
                    </div>
                  </div>

                  {/* Section Title Banner */}
                  <div style={{
                    background: '#0b2545', color: '#fff', padding: '0.65rem 1rem', borderRadius: 4,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.5px' }}>
                      ANNEXURE – IV : CONDITIONS OF CONTRACT & COMMERCIAL TERMS
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#bae6fd', fontWeight: 600 }}>
                      Standard Trading Terms
                    </div>
                  </div>

                  {/* 12 Contract Clauses */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1.5rem' }}>
                    {proposalData.terms.map((item, idx) => (
                      <div key={item.id || idx} style={{ fontSize: '0.76rem', lineHeight: 1.45, color: '#334155' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{idx + 1}. {item.title}:</span>{' '}
                        <span style={{ whiteSpace: 'pre-line' }}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Page 5 Bottom Signatures */}
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', borderTop: '1px solid #cbd5e1', paddingTop: '1.5rem', marginTop: '1rem' }}>
                    {/* Client Acceptance */}
                    <div style={{ background: '#f8fafc', padding: '0.8rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.2rem' }}>
                        Accepted & Confirmed by Client:
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem' }}>
                        {proposalData.client_acceptance_name}
                      </div>
                      <div style={{ borderBottom: '1px dashed #94a3b8', height: 25, width: '90%', margin: '0 auto 0.3rem 0' }}></div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Authorized Customer Seal & Signature</div>
                    </div>

                    {/* Company Signatory */}
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0.8rem' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
                        For {profile.businessName || 'MIF REFRIGERATION'}
                      </div>
                      <div style={{ borderBottom: '1px dashed #94a3b8', height: 35, width: 220, margin: '0.5rem 0 0.3rem auto' }}></div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Authorized Signatory</div>
                    </div>
                  </div>

                  {/* Page 5 Footer */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', marginTop: '1.5rem', paddingTop: '0.5rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                    <div>{profile.businessName || 'MIF Refrigeration'} • Ref: {quotation.quotation_number}</div>
                    <div>Annexure IV: Contract Conditions</div>
                    <div>Page 5 of 5</div>
                  </div>
                </div>
              </div>

            </div>

          {/* ========================================================= */}
          {/* TAB 2: PROPOSAL CUSTOMIZATION & ANNEXURE EDITOR */}
          {/* ========================================================= */}
          {activeTab === 'customize' && (
            <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Card 1: Cover Letter & Transmittal */}
              <div className="glass-panel" style={{ background: '#fff', padding: '1.5rem', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={18} /> 1. Proposal Cover Letter & Client Transmittal
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Proposal Subject</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.subject}
                      onChange={e => setProposalData(p => ({ ...p, subject: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Kind Attn (Customer Contact)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.kind_attn}
                      onChange={e => setProposalData(p => ({ ...p, kind_attn: e.target.value }))}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Transmittal Letter Intro Text</label>
                  <textarea
                    className="form-input" style={{ width: '100%', height: 70, fontSize: '0.82rem' }}
                    value={proposalData.transmittal_body}
                    onChange={e => setProposalData(p => ({ ...p, transmittal_body: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Office Coordinates Footer</label>
                  <input
                    type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                    value={proposalData.office_coordinates}
                    onChange={e => setProposalData(p => ({ ...p, office_coordinates: e.target.value }))}
                  />
                </div>
              </div>

              {/* Card 2: Annexure I Technical Specifications */}
              <div className="glass-panel" style={{ background: '#fff', padding: '1.5rem', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Layers size={18} /> 2. Annexure I — Technical Specifications & Parameters
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Application Title</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.application}
                      onChange={e => updateAnnexureI('application', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Operating Room Temperature</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.room_temp}
                      onChange={e => updateAnnexureI('room_temp', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>External Dimensions (L × W × H)</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.external_size}
                      onChange={e => updateAnnexureI('external_size', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Design Ambient Temperature</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.ambient_temp}
                      onChange={e => updateAnnexureI('ambient_temp', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>PUF Panel Thickness</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.panel_thickness}
                      onChange={e => updateAnnexureI('panel_thickness', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Door Type & Size</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.door_spec}
                      onChange={e => updateAnnexureI('door_spec', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Refrigeration Capacity</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.refrigeration_capacity}
                      onChange={e => updateAnnexureI('refrigeration_capacity', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Refrigerant</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.refrigerant}
                      onChange={e => updateAnnexureI('refrigerant', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Condensing Unit Model</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.condensing_unit}
                      onChange={e => updateAnnexureI('condensing_unit', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Evaporator Model</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.evaporator_model}
                      onChange={e => updateAnnexureI('evaporator_model', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>Sheet Material Lamination</label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_i.sheet_material}
                      onChange={e => updateAnnexureI('sheet_material', e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    9-Point Detailed Engineering Specifications
                  </label>
                  {proposalData.annexure_i.detailed_specs.map((spec, sidx) => (
                    <div key={sidx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, width: 22 }}>{sidx + 1}.</span>
                      <input
                        type="text" className="form-input" style={{ flex: 1, fontSize: '0.8rem' }}
                        value={spec}
                        onChange={e => {
                          const copy = [...proposalData.annexure_i.detailed_specs];
                          copy[sidx] = e.target.value;
                          updateAnnexureI('detailed_specs', copy);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 3: Annexure II Commercial Notes & Extra Piping */}
              <div className="glass-panel" style={{ background: '#fff', padding: '1.5rem', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={18} /> 3. Annexure II — Commercial Notes & Extra Piping Allowance
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Extra Copper Piping Rate (₹ per RFT + GST)
                    </label>
                    <input
                      type="number" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_ii.extra_piping_rate}
                      onChange={e => setProposalData(p => ({
                        ...p,
                        annexure_ii: { ...p.annexure_ii, extra_piping_rate: Number(e.target.value) || 0 }
                      }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Freight / Transport Status
                    </label>
                    <input
                      type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                      value={proposalData.annexure_ii.freight_status}
                      onChange={e => setProposalData(p => ({
                        ...p,
                        annexure_ii: { ...p.annexure_ii, freight_status: e.target.value }
                      }))}
                    />
                  </div>
                </div>

                {/* Items List Customizer */}
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                      Schedule of Items (Bill of Quantities):
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.74rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      onClick={() => {
                        const newItem = {
                          description: 'New Equipment / Line Item',
                          specs: '',
                          quantity: 1,
                          unit: 'Nos',
                          unit_price: 0,
                          total_amount: 0
                        };
                        setProposalData(p => ({
                          ...p,
                          annexure_ii: {
                            ...p.annexure_ii,
                            items: [...(p.annexure_ii?.items || displayItems), newItem]
                          }
                        }));
                      }}
                    >
                      <Plus size={13} /> Add Line Item
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {(proposalData.annexure_ii?.items || displayItems).map((it, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 75px 75px 95px 30px', gap: '0.5rem', alignItems: 'center', background: '#f8fafc', padding: '0.45rem 0.65rem', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                        <div>
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: '0.8rem', width: '100%', fontWeight: 600 }}
                            value={it.description || ''}
                            placeholder="Item description"
                            onChange={e => {
                              const val = e.target.value;
                              setProposalData(p => {
                                const newItems = [...(p.annexure_ii?.items || displayItems)];
                                newItems[idx] = { ...newItems[idx], description: val };
                                return { ...p, annexure_ii: { ...p.annexure_ii, items: newItems } };
                              });
                            }}
                          />
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: '0.74rem', width: '100%', marginTop: '3px', color: '#64748b' }}
                            value={it.specs || ''}
                            placeholder="Optional specifications (e.g. dimensions, model ref)"
                            onChange={e => {
                              const val = e.target.value;
                              setProposalData(p => {
                                const newItems = [...(p.annexure_ii?.items || displayItems)];
                                newItems[idx] = { ...newItems[idx], specs: val };
                                return { ...p, annexure_ii: { ...p.annexure_ii, items: newItems } };
                              });
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>Qty</label>
                          <input
                            type="number"
                            className="form-input"
                            style={{ fontSize: '0.8rem', textAlign: 'center', width: '100%' }}
                            value={it.quantity || 1}
                            onChange={e => {
                              const val = Number(e.target.value) || 0;
                              setProposalData(p => {
                                const newItems = [...(p.annexure_ii?.items || displayItems)];
                                newItems[idx] = { ...newItems[idx], quantity: val, total_amount: val * (Number(newItems[idx].unit_price) || 0) };
                                return { ...p, annexure_ii: { ...p.annexure_ii, items: newItems } };
                              });
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>Unit</label>
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: '0.8rem', textAlign: 'center', width: '100%' }}
                            value={it.unit || 'Nos'}
                            onChange={e => {
                              const val = e.target.value;
                              setProposalData(p => {
                                const newItems = [...(p.annexure_ii?.items || displayItems)];
                                newItems[idx] = { ...newItems[idx], unit: val };
                                return { ...p, annexure_ii: { ...p.annexure_ii, items: newItems } };
                              });
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>Rate (₹)</label>
                          <input
                            type="number"
                            className="form-input"
                            style={{ fontSize: '0.8rem', textAlign: 'right', width: '100%' }}
                            value={it.unit_price || 0}
                            onChange={e => {
                              const val = Number(e.target.value) || 0;
                              setProposalData(p => {
                                const newItems = [...(p.annexure_ii?.items || displayItems)];
                                newItems[idx] = { ...newItems[idx], unit_price: val, total_amount: val * (Number(newItems[idx].quantity) || 1) };
                                return { ...p, annexure_ii: { ...p.annexure_ii, items: newItems } };
                              });
                            }}
                          />
                        </div>
                        <div>
                          <button
                            type="button"
                            className="icon-btn icon-btn-red"
                            style={{ padding: '3px', marginTop: '14px' }}
                            title="Remove Line Item"
                            onClick={() => {
                              setProposalData(p => {
                                const newItems = (p.annexure_ii?.items || displayItems).filter((_, i) => i !== idx);
                                return { ...p, annexure_ii: { ...p.annexure_ii, items: newItems } };
                              });
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 4: Annexure III Excluded Works (12 Clauses) */}
              <div className="glass-panel" style={{ background: '#fff', padding: '1.5rem', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={18} /> 4. Annexure III — 12 Excluded Works (Customer Scope)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                  {proposalData.exclusions.map((item, idx) => (
                    <div key={item.id || idx} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '0.6rem', alignItems: 'center' }}>
                      <input
                        type="text" className="form-input" style={{ fontSize: '0.8rem', fontWeight: 600 }}
                        value={item.title}
                        onChange={e => updateExclusion(idx, 'title', e.target.value)}
                      />
                      <input
                        type="text" className="form-input" style={{ fontSize: '0.8rem' }}
                        value={item.desc}
                        onChange={e => updateExclusion(idx, 'desc', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Site Readiness Callout Text
                  </label>
                  <textarea
                    className="form-input" style={{ width: '100%', height: 60, fontSize: '0.82rem' }}
                    value={proposalData.site_readiness}
                    onChange={e => setProposalData(p => ({ ...p, site_readiness: e.target.value }))}
                  />
                </div>
              </div>

              {/* Card 5: Annexure IV Terms & Conditions (12 Clauses) */}
              <div className="glass-panel" style={{ background: '#fff', padding: '1.5rem', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={18} /> 5. Annexure IV — Conditions of Contract & Payment Terms
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                  {proposalData.terms.map((item, idx) => (
                    <div key={item.id || idx} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '0.6rem', alignItems: 'start' }}>
                      <input
                        type="text" className="form-input" style={{ fontSize: '0.8rem', fontWeight: 600 }}
                        value={item.title}
                        onChange={e => updateTerm(idx, 'title', e.target.value)}
                      />
                      <textarea
                        className="form-input" style={{ fontSize: '0.8rem', height: item.title === 'Payment Terms' ? 65 : 45 }}
                        value={item.text}
                        onChange={e => updateTerm(idx, 'text', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Client Acceptance Block Name
                  </label>
                  <input
                    type="text" className="form-input" style={{ width: '100%', fontSize: '0.85rem' }}
                    value={proposalData.client_acceptance_name}
                    onChange={e => setProposalData(p => ({ ...p, client_acceptance_name: e.target.value }))}
                  />
                </div>
              </div>

              {/* Bottom Actions inside Customize */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingBottom: '2rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveTab('preview')}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Eye size={15} /> Switch to 5-Page Preview
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveProposal}
                  disabled={isSaving}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#0284c7', borderColor: '#0284c7' }}
                >
                  <Save size={15} /> {isSaving ? 'Saving...' : 'Save All Customizations'}
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}