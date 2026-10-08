import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Option {
  id: string;
  label: string;
}

interface AutocompleteProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const Autocomplete: React.FC<AutocompleteProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  label,
  required,
  disabled,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div className={`space-y-2 relative ${className}`} ref={containerRef}>
      {label && (
        <label className="text-[10px] font-bold text-brand-gold uppercase tracking-widest block ml-1">
          {label} {required && '*'}
        </label>
      )}
      <div className="relative">
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text flex items-center justify-between cursor-pointer transition-all ${
            isOpen ? 'ring-2 ring-brand-gold/10 border-brand-gold/40' : 'hover:bg-white/10'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className={`truncate font-medium ${!selectedOption ? 'text-brand-muted/30' : ''}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown size={18} className={`text-brand-gold/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute z-50 w-full mt-2 bg-brand-card border border-brand-gold/20 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="p-2 border-b border-white/5 bg-white/5">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gold/30" />
                  <input
                    autoFocus
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Type to search..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-gold/40 font-medium placeholder:text-brand-muted/30"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar bg-brand-card">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((opt) => (
                    <div
                      key={opt.id}
                      onClick={() => handleSelect(opt.id)}
                      className={`px-4 py-3 text-sm cursor-pointer flex items-center justify-between hover:bg-white/5 transition-colors ${
                        value === opt.id ? 'bg-brand-gold/10 text-brand-gold font-bold' : 'text-brand-text font-medium'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {value === opt.id && <Check size={16} />}
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-brand-muted/30 text-sm italic">
                    No results found
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Autocomplete;
