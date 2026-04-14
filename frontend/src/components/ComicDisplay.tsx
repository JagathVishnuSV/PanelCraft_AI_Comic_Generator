import { useEffect, useRef, useState } from 'react';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Download as DownloadIcon, Image as ImageIconIcon, FileText as FileTextIcon, Sparkles as SparklesIcon } from 'lucide-react';

const ChevronLeft = ChevronLeftIcon as any;
const ChevronRight = ChevronRightIcon as any;
const Download = DownloadIcon as any;
const ImageIcon = ImageIconIcon as any;
const FileText = FileTextIcon as any;
const Sparkles = SparklesIcon as any;

const PUTER_SCRIPT_SRC = 'https://js.puter.com/v2/';
const PUTER_CACHE_KEY = 'panelcraft_puter_image_cache_v1';
const PUTER_TEST_MODE = process.env.NEXT_PUBLIC_PUTER_TEST_MODE === 'true';
const BACKEND_URL = (process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');

interface ComicPanelResponse {
  panel_number: number;
  scene_description: string;
  panel_text?: string;
  image_prompt?: string;
  image_url: string;
}

interface ComicDisplayProps {
  panels: ComicPanelResponse[];
  projectId?: number;
}

const normalizePromptForCache = (prompt: string) =>
  prompt.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 1000);

const promptCacheKeyFromText = (prompt: string) => {
  const normalized = normalizePromptForCache(prompt);
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return `p-${Math.abs(hash)}`;
};

const readPuterCache = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PUTER_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writePuterCache = (cache: Record<string, string>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PUTER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write failures so generation still works.
  }
};

const ensurePuterSdkLoaded = async (): Promise<any> => {
  if (typeof window === 'undefined') {
    throw new Error('Puter can only run in the browser.');
  }

  const win = window as any;
  if (win.puter?.ai?.txt2img) {
    return win.puter;
  }

  const scriptId = 'panelcraft-puter-sdk';
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;

  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.src = PUTER_SCRIPT_SRC;
    script.async = true;
    document.head.appendChild(script);
  }

  return await new Promise((resolve, reject) => {
    const finish = () => {
      if (win.puter?.ai?.txt2img) {
        resolve(win.puter);
        return;
      }
      reject(new Error('Puter SDK loaded but txt2img is unavailable.'));
    };

    if (win.puter?.ai?.txt2img) {
      finish();
      return;
    }

    script!.addEventListener('load', finish, { once: true });
    script!.addEventListener('error', () => reject(new Error('Failed to load Puter SDK.')), { once: true });

    window.setTimeout(() => {
      if (win.puter?.ai?.txt2img) {
        resolve(win.puter);
      } else {
        reject(new Error('Timed out while loading Puter SDK.'));
      }
    }, 15000);
  });
};

export default function ComicDisplay({ panels, projectId }: ComicDisplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});
  const [puterOverrides, setPuterOverrides] = useState<Record<number, string>>({});
  const [puterLoading, setPuterLoading] = useState<Record<number, boolean>>({});
  const [puterBatchLoading, setPuterBatchLoading] = useState(false);
  const [puterMessage, setPuterMessage] = useState<string | null>(null);
  const comicContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentIndex(0);
    setImageError({});
    setPuterOverrides({});
    setPuterLoading({});
    setPuterMessage(null);
  }, [panels]);

  if (!panels || panels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
        <ImageIcon className="w-12 h-12 text-gray-400 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">No panels to display.</p>
      </div>
    );
  }

  const currentPanel = panels[currentIndex];

  const getImageUrl = (sourceUrl: string) => {
    if (!sourceUrl) {
      return sourceUrl;
    }

    if (sourceUrl.startsWith('data:') || sourceUrl.startsWith('/api/image-proxy')) {
      return sourceUrl;
    }

    const absoluteUrl =
      sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')
        ? sourceUrl
        : `${BACKEND_URL}${sourceUrl.startsWith('/') ? '' : '/'}${sourceUrl}`;

    // Route through Next.js to avoid browser CORS/canvas taint issues during PDF export.
    return `/api/image-proxy?url=${encodeURIComponent(absoluteUrl)}`;
  };

  const getPromptForPanel = (panel: ComicPanelResponse) =>
    (panel.image_prompt || panel.scene_description || 'Cinematic comic panel illustration').trim();

  const getDisplayImageUrl = (panel: ComicPanelResponse) =>
    getImageUrl(puterOverrides[panel.panel_number] || panel.image_url);

  const markPanelLoading = (panelNumber: number, isLoading: boolean) => {
    setPuterLoading((prev) => ({ ...prev, [panelNumber]: isLoading }));
  };

  const clearPanelImageError = (panelNumber: number) => {
    setImageError((prev) => {
      const next = { ...prev };
      delete next[panelNumber];
      return next;
    });
  };

  const generatePanelWithPuter = async (panel: ComicPanelResponse): Promise<'cache' | 'fresh'> => {
    const prompt = getPromptForPanel(panel);
    const promptKey = promptCacheKeyFromText(prompt);
    const cache = readPuterCache();
    const cachedImage = cache[promptKey];
    if (cachedImage) {
      setPuterOverrides((prev) => ({ ...prev, [panel.panel_number]: cachedImage }));
      clearPanelImageError(panel.panel_number);
      return 'cache';
    }

    const puter = await ensurePuterSdkLoaded();
    const result = await puter.ai.txt2img(prompt, PUTER_TEST_MODE);

    let imageSrc: string | null = null;
    if (typeof result === 'string') {
      imageSrc = result;
    } else if (result && typeof result.src === 'string') {
      imageSrc = result.src;
    } else if (Array.isArray(result) && result[0] && typeof result[0].src === 'string') {
      imageSrc = result[0].src;
    }

    if (!imageSrc) {
      throw new Error('Puter did not return a valid image URL.');
    }

    cache[promptKey] = imageSrc;
    writePuterCache(cache);

    setPuterOverrides((prev) => ({ ...prev, [panel.panel_number]: imageSrc }));
    clearPanelImageError(panel.panel_number);
    return 'fresh';
  };

  const enhanceCurrentPanelWithPuter = async () => {
    const panel = panels[currentIndex];
    if (!panel) return;

    setPuterMessage(null);
    markPanelLoading(panel.panel_number, true);
    try {
      const mode = await generatePanelWithPuter(panel);
      setPuterMessage(
        mode === 'cache'
          ? `Loaded panel ${panel.panel_number} from Puter cache.`
          : `Regenerated panel ${panel.panel_number} with Puter.`
      );
    } catch (error: any) {
      setPuterMessage(error?.message || 'Puter generation failed for this panel.');
    } finally {
      markPanelLoading(panel.panel_number, false);
    }
  };

  const enhanceAllPanelsWithPuter = async () => {
    if (!panels.length) return;

    setPuterBatchLoading(true);
    setPuterMessage('Enhancing all panels with Puter...');

    let generated = 0;
    let fromCache = 0;
    let failed = 0;
    let cursor = 0;
    const concurrency = Math.min(2, panels.length);

    const worker = async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= panels.length) {
          break;
        }

        const panel = panels[index];
        markPanelLoading(panel.panel_number, true);
        try {
          const mode = await generatePanelWithPuter(panel);
          if (mode === 'cache') {
            fromCache += 1;
          } else {
            generated += 1;
          }
        } catch {
          failed += 1;
        } finally {
          markPanelLoading(panel.panel_number, false);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      setPuterMessage(`Puter enhancement finished: ${generated} new, ${fromCache} cached, ${failed} failed.`);
    } catch (error: any) {
      setPuterMessage(error?.message || 'Puter enhancement failed.');
    } finally {
      setPuterBatchLoading(false);
    }
  };

  const handleImageError = (panelNumber: number) => {
    setImageError(prev => ({ ...prev, [panelNumber]: true }));
  };

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => prevIndex === 0 ? panels.length - 1 : prevIndex - 1);
  };

  const goToNext = () => {
    setCurrentIndex((prevIndex) => prevIndex === panels.length - 1 ? 0 : prevIndex + 1);
  };

  const downloadComic = async () => {
    if (typeof window !== 'undefined') {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');

        if (comicContainerRef.current) {
          const canvas = await html2canvas(comicContainerRef.current, {
            scale: 2,
            useCORS: true,
            imageTimeout: 30000,
            allowTaint: false,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/png');

          const pdf = new jsPDF({ orientation: 'landscape', unit: 'px' });
          const imgProps = pdf.getImageProperties(imgData);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`comic-${projectId || 'download'}.pdf`);
        }
      } catch (error: any) {
        console.error('Error downloading comic via canvas path:', error);
        try {
          // Fallback: download using direct image binary if canvas capture fails.
          const { jsPDF } = await import('jspdf');
          const imageUrl = getDisplayImageUrl(currentPanel);
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
            throw new Error(`Image fetch failed (${imageResponse.status})`);
          }

          const imageBlob = await imageResponse.blob();
          const imageDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result);
                return;
              }
              reject(new Error('Failed to read image blob.'));
            };
            reader.onerror = () => reject(new Error('Failed to convert image for PDF download.'));
            reader.readAsDataURL(imageBlob);
          });

          const pdf = new jsPDF({ orientation: 'portrait', unit: 'px' });
          const imgProps = pdf.getImageProperties(imageDataUrl);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          pdf.addImage(imageDataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`comic-panel-${currentPanel.panel_number}-${projectId || 'download'}.pdf`);
        } catch (fallbackError: any) {
          console.error('Error downloading comic via fallback path:', fallbackError);
          const message = fallbackError?.message || error?.message || 'Unknown download error';
          alert(`Failed to download comic. ${message}`);
        }
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden transition-colors duration-300">
      <div className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={goToPrevious}
            className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Previous panel"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 px-4 py-1.5 rounded-full text-sm">
            Panel {currentIndex + 1} <span className="text-gray-400 dark:text-gray-500">/ {panels.length}</span>
          </span>
          <button
            onClick={goToNext}
            className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Next panel"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            onClick={enhanceCurrentPanelWithPuter}
            disabled={Boolean(puterLoading[currentPanel.panel_number]) || puterBatchLoading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-60"
            title="Generate this panel with Puter free image generation"
          >
            <Sparkles className="w-4 h-4" />
            {puterLoading[currentPanel.panel_number] ? 'Generating...' : 'Use Puter (This Panel)'}
          </button>

          <button
            onClick={enhanceAllPanelsWithPuter}
            disabled={puterBatchLoading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-medium rounded-xl hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors disabled:opacity-60"
            title="Efficiently regenerate all panels with Puter using local cache and limited concurrency"
          >
            <Sparkles className="w-4 h-4" />
            {puterBatchLoading ? 'Enhancing All...' : 'Use Puter (All Panels)'}
          </button>

          <button
            onClick={downloadComic}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>
      </div>

      {puterMessage && (
        <div className="px-4 md:px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-emerald-50/70 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 text-sm font-medium">
          {puterMessage}
        </div>
      )}

      <div className="p-4 md:p-8 bg-gray-50 dark:bg-gray-950/50">
        <div
          ref={comicContainerRef}
          className="max-w-3xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden"
        >
          <div className="relative aspect-[4/3] w-full bg-gray-100 dark:bg-gray-800">
            {imageError[currentPanel.panel_number] && !puterOverrides[currentPanel.panel_number] ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                <p>Image failed to load</p>
                <button
                  onClick={enhanceCurrentPanelWithPuter}
                  disabled={Boolean(puterLoading[currentPanel.panel_number]) || puterBatchLoading}
                  className="mt-3 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {puterLoading[currentPanel.panel_number] ? 'Regenerating...' : 'Fix With Puter'}
                </button>
              </div>
            ) : (
              <img
                src={getDisplayImageUrl(currentPanel)}
                alt={`Comic panel ${currentPanel.panel_number}`}
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => handleImageError(currentPanel.panel_number)}
              />
            )}

            {puterOverrides[currentPanel.panel_number] && (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                Puter Enhanced
              </div>
            )}

            {puterLoading[currentPanel.panel_number] && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="px-4 py-2 rounded-lg bg-white/90 text-gray-800 text-sm font-semibold">
                  Generating with Puter...
                </div>
              </div>
            )}

            {currentPanel.panel_text && (
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-black/80 via-black/50 to-transparent">
                <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-4 rounded-lg border border-white/20 dark:border-gray-700/50 shadow-xl max-w-2xl mx-auto transform translate-y-2">
                  <p className="text-gray-900 dark:text-gray-100 font-medium text-sm md:text-base leading-relaxed">
                    {currentPanel.panel_text}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="p-5 md:p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="flex items-start gap-3 mb-4">
              <FileText className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Scene Description</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{currentPanel.scene_description}</p>
              </div>
            </div>

            {currentPanel.image_prompt && (
              <div className="flex items-start gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <ImageIcon className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Image Prompt</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded-md break-words">
                    {currentPanel.image_prompt}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}