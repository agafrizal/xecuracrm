import { GoogleGenAI } from '@google/genai';

/**
 * Extracts raw printable text from an ArrayBuffer (e.g. from a PDF or text file)
 */
function extractTextFromArrayBuffer(buffer: ArrayBuffer): string {
  try {
    const uint8Arr = new Uint8Array(buffer);
    let str = '';
    // Process in chunks to avoid call stack limits
    const chunkSize = 8192;
    for (let i = 0; i < uint8Arr.length; i += chunkSize) {
      const chunk = uint8Arr.subarray(i, i + chunkSize);
      str += String.fromCharCode.apply(null, Array.from(chunk));
    }

    // Clean up text: replace non-printable characters with spaces
    const cleanStr = str.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    return cleanStr;
  } catch (err) {
    console.error('Error reading array buffer as text:', err);
    return '';
  }
}

/**
 * Regex-based extraction of PO Number from text
 */
export function parsePoNumberFromText(text: string): string | null {
  if (!text || text.trim().length === 0) return null;

  // Normalization: clean up multiple spaces
  const normalized = text.replace(/\s+/g, ' ');

  // 1. High-confidence regex patterns with explicit labels
  const labelPatterns = [
    /customer\s*po\s*(?:number|no|#)?\s*[:#\.\-]?\s*([A-Za-z0-9/\-_]{3,35})/i,
    /purchase\s*order\s*(?:number|no|#)?\s*[:#\.\-]?\s*([A-Za-z0-9/\-_]{3,35})/i,
    /p\.o\.\s*(?:number|no|#)?\s*[:#\.\-]?\s*([A-Za-z0-9/\-_]{3,35})/i,
    /po\s*(?:number|no|num|#)\s*[:#\.\-]?\s*([A-Za-z0-9/\-_]{3,35})/i,
    /nomor\s*po\s*[:#\.\-]?\s*([A-Za-z0-9/\-_]{3,35})/i,
    /no\.\s*po\s*[:#\.\-]?\s*([A-Za-z0-9/\-_]{3,35})/i,
    /no\s*po\s*[:#\.\-]?\s*([A-Za-z0-9/\-_]{3,35})/i,
    /po\s*ref(?:erence)?\s*[:#\.\-]?\s*([A-Za-z0-9/\-_]{3,35})/i,
  ];

  for (const pattern of labelPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Filter out generic label words if captured accidentally
      if (!/^(number|no|date|tanggal|amount|total|to|from)$/i.test(candidate) && candidate.length >= 3) {
        return candidate;
      }
    }
  }

  // 2. Format-based regex patterns (standalone PO number formats)
  const formatPatterns = [
    /\b(PO[-_/][A-Za-z0-9/\-_]{3,25})\b/i,
    /\b(P\.O\.[-_/][A-Za-z0-9/\-_]{3,25})\b/i,
    /\b(45\d{8,10})\b/, // SAP PO style (4500xxxxxx)
    /\b(PO\d{4,12})\b/i,
  ];

  for (const pattern of formatPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Converts a File to base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove Data-URL prefix (e.g. data:application/pdf;base64,)
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Main function: Extract PO Number from an uploaded file (PDF or Image)
 */
export async function extractPoNumberFromFile(file: File): Promise<string | null> {
  console.log(`Extracting PO Number from file: ${file.name} (${file.type})`);

  // Try 1: Gemini Multimodal Vision / Document AI if API key is present
  const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || 
                 (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY);

  if (apiKey) {
    try {
      console.log('Attempting extraction via Gemini API...');
      const ai = new GoogleGenAI({ apiKey });
      const base64Data = await fileToBase64(file);

      const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/png');

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: 'Analyze this Purchase Order document carefully. Find the Customer PO Number (or PO Number / Order Number / No. PO). Respond strictly with a JSON object in this format: {"poNumber": "extracted_number"}. If no PO number is present, set "poNumber" to "". Do not wrap in markdown or code blocks.',
              },
            ],
          },
        ],
      });

      const responseText = response.text?.trim() || '';
      console.log('Gemini extraction raw response:', responseText);

      // Clean response text from ```json ... ``` wrapper if present
      const cleanedJsonText = responseText.replace(/```json\s*|\s*```/gi, '').trim();
      const parsed = JSON.parse(cleanedJsonText);

      if (parsed && typeof parsed.poNumber === 'string' && parsed.poNumber.trim().length > 0) {
        console.log('Successfully extracted PO number via Gemini:', parsed.poNumber.trim());
        return parsed.poNumber.trim();
      }
    } catch (err) {
      console.warn('Gemini extraction attempt failed or key invalid, falling back to local text parser:', err);
    }
  }

  // Try 2: Local text stream parsing from file buffer
  try {
    const arrayBuffer = await file.arrayBuffer();
    const extractedText = extractTextFromArrayBuffer(arrayBuffer);
    const poFromText = parsePoNumberFromText(extractedText);

    if (poFromText) {
      console.log('Successfully extracted PO number via local text parser:', poFromText);
      return poFromText;
    }
  } catch (err) {
    console.error('Local array buffer extraction error:', err);
  }

  // Try 3: Fallback extraction from filename if filename contains PO pattern (e.g., PO_45001234_Acme.pdf or PO-2026-001.pdf)
  const filenameMatch = file.name.match(/(PO[-_/]?[A-Za-z0-9/\-_]{3,20})/i);
  if (filenameMatch && filenameMatch[1]) {
    const poFromFilename = filenameMatch[1].trim();
    console.log('Extracted PO number from filename:', poFromFilename);
    return poFromFilename;
  }

  return null;
}
