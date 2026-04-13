import { useState, useRef } from 'react';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Download as DownloadIcon, Image as ImageIconIcon, MessageSquare as MessageSquareIcon, FileText as FileTextIcon } from 'lucide-react';

const ChevronLeft = ChevronLeftIcon as any;
const ChevronRight = ChevronRightIcon as any;
const Download = DownloadIcon as any;
const ImageIcon = ImageIconIcon as any;
const MessageSquare = MessageSquareIcon as any;
const FileText = FileTextIcon as any;

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

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

export default function ComicDisplay({ panels, projectId }: ComicDisplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});
  const comicContainerRef = useRef<HTMLDivElement>(null);

  if (!panels || panels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
        <ImageIcon className="w-12 h-12 text-gray-400 mb-4" />
        <p className="text-gray-500 dark:text-gray-400 font-medium">No panels to display.</p>
      </div>
    );
  }

  const currentPanel = panels[currentIndex];
  
  const getImageUrl = (relativeUrl: string) => {
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }
    // Use relative URL so Next.js proxy handles it, avoiding CORS issues with html2canvas
    return relativeUrl;
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
      } catch (error) {
        console.error('Error downloading comic:', error);
        alert('Failed to download comic. Please try again later.');
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
        
        <button
          onClick={downloadComic}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </button>
      </div>
      
      <div className="p-4 md:p-8 bg-gray-50 dark:bg-gray-950/50">
        <div 
          ref={comicContainerRef}
          className="max-w-3xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden"
        >
          <div className="relative aspect-[4/3] w-full bg-gray-100 dark:bg-gray-800">
            {imageError[currentPanel.panel_number] ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                <p>Image failed to load</p>
              </div>
            ) : (
              <img
                src={getImageUrl(currentPanel.image_url)}
                alt={`Comic panel ${currentPanel.panel_number}`}
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => handleImageError(currentPanel.panel_number)}
              />
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