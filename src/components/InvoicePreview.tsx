import React, { useRef, useState } from 'react';
import { Invoice, Company, PurchaseOrder } from '../types';
import { format } from 'date-fns';
import { currencyService } from '../services/currencyService';
import { X, Printer, ShieldCheck, QrCode, ExternalLink } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import DigitalSignatureModal from './DigitalSignatureModal';

interface InvoicePreviewProps {
  invoice: Invoice;
  company?: Company;
  po?: PurchaseOrder;
  userRole?: string;
  onClose: () => void;
  onInvoiceUpdated?: (updatedInvoice: Invoice) => void;
}

const InvoicePreview: React.FC<InvoicePreviewProps> = ({ invoice, company, po, userRole, onClose, onInvoiceUpdated }) => {
  const [currentInvoice, setCurrentInvoice] = useState<Invoice>(invoice);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: contentRef,
    documentTitle: `Invoice_${currentInvoice.invoiceNumber}`,
  });

  const isAdmin = userRole === 'admin';

  const formatIDR = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const subtotal = po?.amount || currentInvoice.amount;
  const ppn = subtotal * 0.11;
  const total = subtotal + ppn;

  const rawItems = currentInvoice.items && currentInvoice.items.length > 0 ? currentInvoice.items : [
    {
      id: '1',
      description: po?.title || currentInvoice.title,
      qty: 1,
      unitPrice: po?.amount || currentInvoice.amount,
      amount: po?.amount || currentInvoice.amount
    }
  ];

  const items = rawItems.map(item => {
    if (po) {
      return {
        ...item,
        description: po.title || item.description,
        unitPrice: rawItems.length === 1 ? po.amount : item.unitPrice,
        amount: rawItems.length === 1 ? po.amount : item.amount,
      };
    }
    return item;
  });

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-900/80 backdrop-blur-sm">
      {/* Top action bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-brand-card border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-brand-gold uppercase tracking-widest">Preview Invoice</h2>
          {currentInvoice.signatureInfo && (
            <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-full flex items-center gap-1.5">
              <ShieldCheck size={14} /> Digitally Signed ({currentInvoice.signatureInfo.provider})
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Action button to sign (ONLY visible to Admin) */}
          {isAdmin && (
            <button
              onClick={() => setIsSignModalOpen(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all uppercase tracking-widest text-sm shadow-md ${
                currentInvoice.signatureInfo
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              <ShieldCheck size={18} />
              {currentInvoice.signatureInfo ? 'Re-Sign / Update Signature' : 'Sign Invoice'}
            </button>
          )}

          <button
            onClick={() => handlePrint()}
            className="flex items-center gap-2 bg-brand-gold text-brand-bg px-4 py-2 rounded-xl font-bold hover:opacity-90 transition-all uppercase tracking-widest text-sm"
          >
            <Printer size={18} />
            Print / Save PDF
          </button>

          <button
            onClick={onClose}
            className="p-2 text-brand-muted hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-y-auto p-8 flex justify-center">
        {/* A4 Size Container */}
        <div 
          className="bg-white w-[210mm] h-[297mm] text-slate-800 shadow-2xl relative overflow-hidden flex flex-col"
          ref={contentRef}
        >
          {/* Internal padding container */}
          <div className="p-10 flex-1 flex flex-col relative">
            
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center">
                <img src="/xecura.png" alt="Xecura Logo" className="h-10 object-contain" />
              </div>
              <div className="text-right text-sm">
                <div className="font-bold text-slate-800">PT Gan Mitra Usaha</div>
                <div className="text-slate-600">Gran Rubina Business Park, Generali Tower 20th Floor</div>
                <div className="text-slate-600">Jl. H.R. Rasuna Said Kav. C-22, Jakarta Selatan 12940, Indonesia</div>
                <div className="text-[#0066cc]">www.xecura.id</div>
              </div>
            </div>

            {/* Blue Divider */}
            <div className="h-[2px] bg-[#0066cc] w-full mb-6"></div>

            {/* Title Row */}
            <div className="flex justify-between items-end mb-8">
              <div>
                <h1 className="text-4xl font-bold text-slate-900 tracking-wider">INVOICE</h1>
              </div>
              <div className="text-sm">
                <div className="grid grid-cols-[90px_1fr] gap-2 mb-1">
                  <div className="text-slate-500">No.</div>
                  <div className="font-bold text-[#0066cc]">{currentInvoice.invoiceNumber}</div>
                </div>
                <div className="grid grid-cols-[90px_1fr] gap-2 mb-1">
                  <div className="text-slate-500">Tanggal</div>
                  <div className="text-slate-800">{format(currentInvoice.issueDate.toDate(), 'd MMMM yyyy')}</div>
                </div>
                <div className="grid grid-cols-[90px_1fr] gap-2">
                  <div className="text-slate-500 whitespace-nowrap">Jatuh Tempo</div>
                  <div className="text-slate-800">{format(currentInvoice.dueDate.toDate(), 'd MMMM yyyy')}</div>
                </div>
              </div>
            </div>

            {/* Info Row */}
            <div className="grid grid-cols-2 gap-12 mb-8">
              <div>
                <h3 className="text-[#0066cc] font-bold text-sm tracking-widest uppercase mb-3">Ditagihkan Kepada</h3>
                <div className="font-bold text-slate-900 text-base mb-1">{company?.name || 'Nama Perusahaan tidak tersedia'}</div>
                <div className="text-slate-600 text-sm whitespace-pre-line leading-relaxed">
                  {company?.address ? company.address : 'Alamat Perusahaan belum ditentukan'}
                </div>
              </div>
              <div>
                <h3 className="text-[#0066cc] font-bold text-sm tracking-widest uppercase mb-3">Referensi PO</h3>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-sm">
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <span className="text-slate-500 font-medium">No. PO:</span>
                    {po?.poUrl ? (
                      <a
                        href={po.poUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-[#0066cc] font-mono hover:underline inline-flex items-center gap-1"
                        title="Klik untuk membuka dokumen PO"
                      >
                        {po.poNumber}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="font-bold text-[#0066cc] font-mono">{po?.poNumber || 'PO-N/A'}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <span className="text-slate-500 font-medium">Subjek PO:</span>
                    <span className="font-semibold text-slate-800">{po?.title || currentInvoice.title}</span>
                  </div>
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <span className="text-slate-500 font-medium">Tanggal PO:</span>
                    <span className="text-slate-800">
                      {po?.issueDate
                        ? format(po.issueDate.toDate(), 'd MMMM yyyy')
                        : format(currentInvoice.issueDate.toDate(), 'd MMMM yyyy')}
                    </span>
                  </div>
                  {(po?.startDate || po?.endDate) && (
                    <div className="grid grid-cols-[100px_1fr] gap-2">
                      <span className="text-slate-500 font-medium">Periode PO:</span>
                      <span className="text-slate-800">
                        {po.startDate ? format(po.startDate.toDate(), 'd MMM yyyy') : '-'}
                        {' s/d '}
                        {po.endDate ? format(po.endDate.toDate(), 'd MMM yyyy') : '-'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Item Header / Item Count Summary */}
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Rincian Layanan / Items
              </span>
              <span className="text-xs font-bold text-[#0066cc] bg-[#f0f7ff] px-3 py-1 rounded-full border border-[#cce4ff]">
                Jumlah Item: {items.length} item{items.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Table */}
            <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0066cc] text-white">
                    <th className="py-3 px-4 font-bold text-left w-12">No</th>
                    <th className="py-3 px-4 font-bold text-left">Deskripsi Item</th>
                    <th className="py-3 px-4 font-bold text-center w-16">Qty</th>
                    <th className="py-3 px-4 font-bold text-right w-44">Harga Satuan (IDR)</th>
                    <th className="py-3 px-4 font-bold text-right w-44">Jumlah Total (IDR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {items.map((item, index) => (
                    <tr key={item.id || index}>
                      <td className="py-3.5 px-4 text-slate-500">{index + 1}</td>
                      <td className="py-3.5 px-4 text-slate-800 font-medium">{item.description}</td>
                      <td className="py-3.5 px-4 text-center text-slate-800">{item.qty}</td>
                      <td className="py-3.5 px-4 text-right text-slate-800 font-mono">Rp {formatIDR(item.unitPrice)}</td>
                      <td className="py-3.5 px-4 text-right text-slate-900 font-bold font-mono">Rp {formatIDR(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-6">
              <div className="w-80">
                <div className="flex justify-between items-center py-1.5 text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="text-slate-800 font-mono">Rp {formatIDR(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 text-sm">
                  <span className="text-slate-500">PPN 11%</span>
                  <span className="text-slate-800 font-mono">Rp {formatIDR(ppn)}</span>
                </div>
                <div className="flex justify-between items-center py-2 mt-1 border-t border-slate-200 font-bold">
                  <span className="text-slate-900">Total</span>
                  <span className="text-[#0066cc] text-lg font-mono font-bold">Rp {formatIDR(total)}</span>
                </div>
              </div>
            </div>

            {/* Payment Box */}
            <div className="bg-[#f0f7ff] border border-[#cce4ff] rounded-xl p-4 mb-4 w-[60%]">
              <div className="text-[#0066cc] font-bold text-sm mb-2">INSTRUKSI PEMBAYARAN</div>
              <p className="text-slate-600 text-xs leading-relaxed mb-1.5">
                Mohon lakukan pembayaran melalui Transfer Bank ke Rekening Bank:
              </p>
              <table className="text-slate-600 text-xs mb-1.5">
                <tbody>
                  <tr>
                    <td className="pr-3 py-0.5">Penerima</td>
                    <td className="font-bold text-slate-800 py-0.5">: PT Gan Mitra Usaha</td>
                  </tr>
                  <tr>
                    <td className="pr-3 py-0.5">Bank</td>
                    <td className="font-bold text-slate-800 py-0.5">: Bank Sinarmas</td>
                  </tr>
                  <tr>
                    <td className="pr-3 py-0.5">No. Rekening</td>
                    <td className="font-bold text-slate-800 py-0.5">: 0047393008</td>
                  </tr>
                </tbody>
              </table>
              <ul className="text-slate-600 text-xs leading-relaxed list-disc list-inside">
                <li>Mohon cantumkan nomor invoice sebagai referensi (wajib)</li>
                <li>Bukti transfer ke email: <span className="text-[#0066cc] font-medium">finance@xecura.id</span></li>
              </ul>
            </div>

            <div className="absolute bottom-10 left-10 right-10">
              {/* Signature */}
              <div className="flex justify-end mb-2">
                <div className="text-center w-72">
                  <div className="text-slate-600 text-sm mb-2">
                    <div>Hormat kami,</div>
                    <div>PT Gan Mitra Usaha</div>
                  </div>

                  {/* Render Digital Signature Stamp if Signed */}
                  {currentInvoice.signatureInfo ? (
                    <div className="my-2 p-2.5 bg-slate-50 border border-emerald-300/80 rounded-xl text-left relative shadow-sm">
                      <div className="flex items-center justify-between border-b border-emerald-200/80 pb-1 mb-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                          <ShieldCheck size={13} className="text-emerald-600" />
                          Digitally Signed
                        </div>
                        <span className="text-[9px] font-mono text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded font-bold">
                          {currentInvoice.signatureInfo.provider}
                        </span>
                      </div>

                      {currentInvoice.signatureInfo.signatureImage ? (
                        <div className="flex justify-center my-1 py-0.5 border-b border-slate-200">
                          <img
                            src={currentInvoice.signatureInfo.signatureImage}
                            alt="Digital Signature"
                            className="h-12 max-w-full object-contain filter drop-shadow-sm"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 my-1">
                          <div className="w-9 h-9 rounded-lg bg-emerald-600/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                            <QrCode size={20} className="text-emerald-700" />
                          </div>
                          <div className="text-[10px] leading-tight text-slate-700 font-mono">
                            <div className="font-bold text-slate-900">{currentInvoice.signatureInfo.signatureId}</div>
                            <div className="text-[9px] text-slate-500">{currentInvoice.signatureInfo.signedAt}</div>
                          </div>
                        </div>
                      )}

                      <div className="mt-1 pt-1 border-t border-slate-200/80 text-[8px] font-mono text-slate-500 space-y-0.5">
                        <div className="truncate" title={currentInvoice.signatureInfo.certificateHash}>
                          <span className="text-slate-400 font-sans">Hash:</span> {currentInvoice.signatureInfo.certificateHash}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-28 flex flex-col justify-end">
                      {/* Blank space for physical signature or awaiting admin signature */}
                    </div>
                  )}

                  <div className="w-64 border-t border-slate-800 mx-auto pt-2">
                    <div className="font-bold text-slate-900">
                      {currentInvoice.signatureInfo?.signedBy || 'Anthony Pradiptya'}
                    </div>
                    <div className="text-slate-500 text-sm mt-1">
                      {currentInvoice.signatureInfo?.signerRole || 'Direktur Utama'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center text-xs text-[#0066cc] border-t border-slate-200 pt-4">
                <div>www.xecura.id</div>
                <div className="text-slate-400">Terima kasih atas kepercayaan Anda</div>
                <div className="text-slate-400">1 / 1</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Digital Signature Modal */}
      {isSignModalOpen && (
        <DigitalSignatureModal
          invoice={currentInvoice}
          onClose={() => setIsSignModalOpen(false)}
          onSignatureSuccess={(sigInfo) => {
            const updated = {
              ...currentInvoice,
              signatureInfo: sigInfo,
            };
            setCurrentInvoice(updated);
            if (onInvoiceUpdated) {
              onInvoiceUpdated(updated);
            }
          }}
        />
      )}
    </div>
  );
};

export default InvoicePreview;
