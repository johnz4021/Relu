import { useState, useRef } from 'react';
import { posthog, POSTHOG_KEY } from '../lib/posthog';

const track = (event, props) => POSTHOG_KEY && posthog.capture(event, props);

export default function ProblemSolver({ onSelect, disabled }) {
  const [problemText, setProblemText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [solveMode, setSolveMode] = useState('guided');
  const fileInputRef = useRef(null);
  const cardRef = useRef(null);

  const processFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      track('image_uploaded', {});
      setImageFile(file);
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        processFile(file);
        return;
      }
    }
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      setProblemText((prev) => (prev ? prev + '\n' + text : text));
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((!problemText.trim() && !imageFile) || disabled) return;
    const data = { problemText: problemText.trim() };
    if (imagePreview) {
      const match = imagePreview.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        data.imageMimeType = match[1];
        data.imageBase64 = match[2];
      }
    }
    onSelect(solveMode === 'explain' ? 'explain' : 'guided', data);
  };

  const hasContent = problemText.trim() || imageFile;

  return (
    <div className="flex flex-col items-center h-full overflow-auto px-4 pt-16">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-display font-semibold text-text-primary mb-2">
          {solveMode === 'explain' ? 'Just Explain' : 'Guide Me'}
        </h1>
        <p className="text-text-secondary font-body">
          {solveMode === 'explain'
            ? 'Get a quick solution with a visual walkthrough'
            : "Actively learn with the help of AI"}
        </p>
      </div>

      {/* Claude-style input card */}
      <form onSubmit={handleSubmit} className="w-full max-w-2xl">
        <div
          ref={cardRef}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative bg-surface-2 border rounded-2xl overflow-hidden focus-within:border-border-hover transition-colors ${
            isDragging ? 'border-accent' : 'border-border'
          }`}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent-muted/20 border-2 border-dashed border-accent rounded-2xl">
              <span className="text-sm font-medium text-accent font-body">Drop image or text here</span>
            </div>
          )}

          {/* Image preview inside card */}
          {imagePreview && (
            <div className="px-4 pt-4">
              <div className="relative inline-block">
                <img
                  src={imagePreview}
                  alt="Problem screenshot"
                  className="max-h-40 rounded-lg border border-border"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 bg-surface-3 hover:bg-red-600 text-text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs transition-colors"
                >
                  X
                </button>
              </div>
            </div>
          )}

          {/* Textarea */}
          <textarea
            value={problemText}
            onChange={(e) => {
              setProblemText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
            }}
            placeholder="Paste a problem or ask a concept question"
            rows={2}
            className="w-full bg-transparent px-4 pt-4 pb-2 text-sm text-text-primary font-body placeholder-text-tertiary focus:outline-none resize-none"
          />

          {/* Bottom action row */}
          <div className="flex items-center justify-between px-4 pb-3">
            <div className="flex items-center gap-2">
              {/* Mode toggle */}
              <div className="flex items-center bg-surface-3 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setSolveMode('guided')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    solveMode === 'guided'
                      ? 'bg-surface-1 text-text-primary shadow-sm'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  Guide Me
                </button>
                <button
                  type="button"
                  onClick={() => setSolveMode('explain')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    solveMode === 'explain'
                      ? 'bg-surface-1 text-text-primary shadow-sm'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  Just Explain
                </button>
              </div>
              {/* Upload button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-lg text-text-tertiary hover:text-text-secondary transition-colors"
                title="Upload screenshot"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M10 5a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 0110 5z" />
                </svg>
              </button>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={!hasContent || disabled}
              className={`p-1.5 rounded-lg transition-colors ${
                hasContent && !disabled
                  ? 'text-accent hover:text-accent-hover'
                  : 'text-text-tertiary cursor-not-allowed'
              }`}
              title={solveMode === 'explain' ? 'Explain it' : 'Guide me'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
