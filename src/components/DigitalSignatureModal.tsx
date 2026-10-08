import React, { useState, useRef } from 'react';
import { X, ShieldCheck, Loader2, Key, Globe, RefreshCw, PenTool, CheckCircle2, QrCode, Check } from 'lucide-react';
import { Invoice, DigitalSignatureInfo } from '../types';
import { digitalSignatureService, DEFAULT_SIGNATURE_CONFIG, SignatureApiConfig } from '../utils/digitalSignatureService';
import { updateDoc, doc, db, logEvent } from '../firebase';

interface DigitalSignatureModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSignatureSuccess: (updatedInfo: DigitalSignatureInfo) => void;
}

export const DigitalSignatureModal: React.FC<DigitalSignatureModalProps> = ({
  invoice,
  onClose,
  onSignatureSuccess,
}) => {
  const [config, setConfig] = useState<SignatureApiConfig>({
    ...DEFAULT_SIGNATURE_CONFIG,
  });

  const [activeTab, setActiveTab] = useState<'api' | 'sign'>('sign');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isSigning, setIsSigning] = useState(false);
  const [signSuccess, setSignSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Drawing canvas state
  const [useDrawnSignature, setUseDrawnSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const handleTestApi = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await digitalSignatureService.testConnection(config);
    setIsTesting(false);
    setTestResult(result);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.strokeStyle = '#0066cc';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getDrawnSignatureDataUrl = (): string | undefined => {
    if (!useDrawnSignature) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    return canvas.toDataURL('image/png');
  };

  const handleSign = async () => {
    setIsSigning(true);
    setErrorMessage(null);

    try {
      const drawnDataUrl = getDrawnSignatureDataUrl();
      const sigInfo = await digitalSignatureService.signInvoiceDocument(invoice, config, drawnDataUrl);

      // Save to Firestore
      const invoiceRef = doc(db, 'invoices', invoice.id);
      await updateDoc(invoiceRef, {
        signatureInfo: sigInfo,
        updatedAt: new Date(),
      });

      await logEvent('Invoice Digitally Signed', `Invoice ${invoice.invoiceNumber} signed via ${config.provider} by ${config.signerName}`);

      setSignSuccess(true);
      setTimeout(() => {
        onSignatureSuccess(sigInfo);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Digital signing error:', err);
      setErrorMessage(err.message || 'Failed to sign invoice via Digital Signature API');
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
      <div className="bg-brand-card border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Digital Signature API Integration</h3>
              <p className="text-xs text-brand-muted">Authorized Admin Document Signing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-brand-muted hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Nav Tabs */}
        <div className="flex border-b border-white/10 bg-white/5 px-6">
          <button
            onClick={() => setActiveTab('sign')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'sign'
                ? 'border-brand-gold text-brand-gold'
                : 'border-transparent text-brand-muted hover:text-white'
            }`}
          >
            <PenTool size={14} />
            Sign Document
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'api'
                ? 'border-brand-gold text-brand-gold'
                : 'border-transparent text-brand-muted hover:text-white'
            }`}
          >
            <Globe size={14} />
            API Connection & Credentials
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-5 flex-1">
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-brand-gold/10 border border-brand-gold/20 rounded-xl text-xs text-brand-gold leading-relaxed">
                <span className="font-bold">API Connection Active:</span> Configure your external Digital Signature API service (e.g. Xecura API, PrivyID, or DocuSign). Requests are secured with SHA-256 certificate hashing.
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">API Provider</label>
                <select
                  value={config.provider}
                  onChange={(e) => setConfig({ ...config, provider: e.target.value as any })}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 text-xs font-medium"
                >
                  <option value="Xecura e-Sign API" className="bg-slate-900">Xecura e-Sign API v2 (Default)</option>
                  <option value="PrivyID API" className="bg-slate-900">PrivyID Enterprise API</option>
                  <option value="DocuSign Connect" className="bg-slate-900">DocuSign REST API</option>
                  <option value="Custom API" className="bg-slate-900">Custom e-Signature API Endpoint</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">API Endpoint URL</label>
                <div className="relative">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted" size={14} />
                  <input
                    type="text"
                    value={config.apiEndpoint}
                    onChange={(e) => setConfig({ ...config, apiEndpoint: e.target.value })}
                    placeholder="https://api.xecura.id/v2/digital-signature"
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">API Secret Key / Token</label>
                <div className="relative">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted" size={14} />
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="Enter API Key"
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-gold/20 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestApi}
                  disabled={isTesting}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  {isTesting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Test API Endpoint Connection
                </button>
                {testResult && (
                  <span className={`text-xs font-medium flex items-center gap-1 ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {testResult.success ? <CheckCircle2 size={14} /> : <X size={14} />}
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sign' && (
            <div className="space-y-4">
              {/* Invoice Summary Box */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-brand-muted">Target Document:</span>
                  <span className="font-bold font-mono text-brand-gold">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-brand-muted">Document Subject:</span>
                  <span className="font-medium text-white truncate max-w-[200px]">{invoice.title}</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-white/10">
                  <span className="text-brand-muted">Total Amount:</span>
                  <span className="font-bold text-emerald-400">Rp {new Intl.NumberFormat('id-ID').format(invoice.amount * 1.11)}</span>
                </div>
              </div>

              {/* Signer Info Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Signer Name</label>
                  <input
                    type="text"
                    value={config.signerName}
                    onChange={(e) => setConfig({ ...config, signerName: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-brand-text text-xs font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Signer Role</label>
                  <input
                    type="text"
                    value={config.signerRole}
                    onChange={(e) => setConfig({ ...config, signerRole: e.target.value })}
                    className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-brand-text text-xs font-medium"
                  />
                </div>
              </div>

              {/* Signature Mode Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest">Signature Display Style</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUseDrawnSignature(false)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                        !useDrawnSignature ? 'bg-brand-gold text-brand-bg' : 'bg-white/5 text-brand-muted hover:text-white'
                      }`}
                    >
                      Official Seal Stamp
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseDrawnSignature(true)}
                      className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${
                        useDrawnSignature ? 'bg-brand-gold text-brand-bg' : 'bg-white/5 text-brand-muted hover:text-white'
                      }`}
                    >
                      Draw Custom Signature
                    </button>
                  </div>
                </div>

                {useDrawnSignature ? (
                  <div className="space-y-1.5">
                    <div className="relative border-2 border-dashed border-white/20 rounded-xl bg-white overflow-hidden touch-none">
                      <canvas
                        ref={canvasRef}
                        width={480}
                        height={120}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className="w-full h-28 cursor-crosshair"
                      />
                      <button
                        type="button"
                        onClick={clearCanvas}
                        className="absolute right-2 bottom-2 px-2.5 py-1 bg-slate-800/80 hover:bg-slate-900 text-white text-[10px] rounded font-medium transition-all"
                      >
                        Clear Canvas
                      </button>
                    </div>
                    <p className="text-[10px] text-brand-muted italic">Draw your handwritten signature above using mouse or touch screen.</p>
                  </div>
                ) : (
                  <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <QrCode size={20} className="text-emerald-400" />
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div className="font-bold text-emerald-400 flex items-center gap-1">
                        <ShieldCheck size={14} /> Official Verified Cryptographic Stamp
                      </div>
                      <p className="text-[11px] text-emerald-300/80">Generates a verified SHA-256 certificate QR badge with provider timestamp.</p>
                    </div>
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">
                  {errorMessage}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-brand-muted hover:text-white transition-colors"
          >
            Cancel
          </button>

          {signSuccess ? (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <Check size={16} /> Signature Applied & Verified!
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSign}
              disabled={isSigning}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 uppercase tracking-wider"
            >
              {isSigning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing via {config.provider}...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Authorize & Sign Document
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DigitalSignatureModal;
