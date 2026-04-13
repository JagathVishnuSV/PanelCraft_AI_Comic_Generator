"use client";

import { useState } from 'react';
import ComicDisplay from '@/components/ComicDisplay';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sparkles as SparklesIcon, BookOpen as BookOpenIcon, Palette as PaletteIcon, Wand2 as Wand2Icon, ChevronDown as ChevronDownIcon, ChevronUp as ChevronUpIcon } from 'lucide-react';

const Sparkles = SparklesIcon as any;
const BookOpen = BookOpenIcon as any;
const Palette = PaletteIcon as any;
const Wand2 = Wand2Icon as any;
const ChevronDown = ChevronDownIcon as any;
const ChevronUp = ChevronUpIcon as any;

interface ComicPanelResponse {
  panel_number: number;
  scene_description: string;
  panel_text?: string;
  image_prompt?: string;
  image_url: string;
}

interface ProjectResponse {
  id: number;
  title: string;
  story_text: string;
  memory_state?: string;
  continuation_hook?: string;
  created_at: string;
  panels: ComicPanelResponse[];
}

export default function Home() {
  const [title, setTitle] = useState('');
  const [storyText, setStoryText] = useState('');
  const [genre, setGenre] = useState('Action/Adventure');
  const [mood, setMood] = useState('Dramatic');
  const [style, setStyle] = useState('Modern Comic Book');
  const [memoryState, setMemoryState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comicResult, setComicResult] = useState<ProjectResponse | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setComicResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/generate-comic/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          title, 
          story_text: storyText, 
          genre, 
          mood, 
          style,
          memory_state: memoryState 
        }),
      });

      if (!response.ok) {
        let errorDetail = 'Failed to generate comic';
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorDetail;
        } catch (jsonError) {
          errorDetail = response.statusText || errorDetail;
        }
        throw new Error(errorDetail);
      }

      const result: ProjectResponse = await response.json();
      setComicResult(result);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const parseMemoryState = (memoryStateStr?: string) => {
    if (!memoryStateStr) return null;
    try {
      return JSON.parse(memoryStateStr);
    } catch (e) {
      return null;
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      <div className="w-full max-w-5xl flex justify-end mb-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-4xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 md:p-10 border border-gray-100 dark:border-gray-800 transition-colors duration-300">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Sparkles className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-4xl md:text-5xl font-extrabold text-center bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
            PanelCraft
          </h1>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-indigo-200 dark:border-indigo-900 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 dark:border-indigo-400 rounded-full border-t-transparent animate-spin"></div>
              <Wand2 className="absolute inset-0 m-auto w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            </div>
            <p className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Crafting your comic...</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Our AI is writing the script, designing panels, and drawing the art.</p>
          </div>
        ) : !comicResult ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-gray-900 dark:text-gray-100"
                  placeholder="e.g., The Last Starfighter"
                  disabled={loading}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="storyText" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Story Concept
                  </label>
                  {memoryState && (
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      Continuing from previous episode
                    </span>
                  )}
                </div>
                <textarea
                  id="storyText"
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  required
                  rows={6}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-gray-900 dark:text-gray-100 resize-none"
                  placeholder="Describe your story idea, characters, and setting..."
                  disabled={loading}
                />
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Art Direction & Style
                </span>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              {showAdvanced && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-gray-900">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Genre</label>
                    <input
                      type="text"
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100"
                      placeholder="Action/Adventure"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Mood</label>
                    <input
                      type="text"
                      value={mood}
                      onChange={(e) => setMood(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100"
                      placeholder="Dramatic"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Visual Style</label>
                    <input
                      type="text"
                      value={style}
                      onChange={(e) => setStyle(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100"
                      placeholder="Modern Comic Book"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !title || !storyText}
              className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-xl text-white font-bold text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/30"
            >
              <BookOpen className="w-5 h-5" />
              Generate Comic
            </button>
          </form>
        ) : null}

        {error && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl flex items-start gap-3">
            <div className="mt-0.5">⚠️</div>
            <div>
              <h3 className="font-semibold">Generation Failed</h3>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {comicResult && (
          <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{comicResult.title}</h2>
              <button
                onClick={() => {
                  setComicResult(null);
                  setMemoryState(null);
                  setStoryText('');
                  setTitle('');
                  setError(null);
                }}
                className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                Start New Project
              </button>
            </div>

            <ComicDisplay panels={comicResult.panels} projectId={comicResult.id} />

            {(comicResult.memory_state || comicResult.continuation_hook) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
                {comicResult.memory_state && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" /> Narrative Memory
                    </h3>
                    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                      {(() => {
                        const memory = parseMemoryState(comicResult.memory_state);
                        if (!memory) return <p>No memory state available.</p>;
                        return Object.entries(memory).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-semibold capitalize text-gray-900 dark:text-gray-100">{key.replace(/_/g, ' ')}:</span> {String(value)}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {comicResult.continuation_hook && (
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800/30 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" /> Next Episode Hook
                      </h3>
                      <p className="text-gray-800 dark:text-gray-200 italic leading-relaxed mb-4">
                        "{comicResult.continuation_hook}"
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setStoryText(comicResult.continuation_hook || '');
                        setMemoryState(comicResult.memory_state || null);
                        setComicResult(null);
                        setError(null);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Wand2 className="w-4 h-4" />
                      Continue Story
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
