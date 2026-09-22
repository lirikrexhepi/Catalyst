import React, { useEffect, useRef, useState } from 'react';
import { OrbitLoader } from './OrbitLoader';
import { TextShimmer } from './TextShimmer';

export interface ThinkingBlockProps {
  isThinking?: boolean;
  thoughtText?: string;
  durationSeconds?: number;
  defaultExpanded?: boolean;
  className?: string;
}

const VERBS = [
  'Accomplishing', 'Actioning', 'Actualizing', 'Architecting', 'Baking', 'Beaming', "Beboppin'",
  'Befuddling', 'Billowing', 'Blanching', 'Bloviating', 'Boogieing', 'Boondoggling', 'Booping',
  'Bootstrapping', 'Brewing', 'Burrowing', 'Calculating', 'Canoodling', 'Caramelizing', 'Cascading',
  'Catapulting', 'Cerebrating', 'Channelling', 'Choreographing', 'Churning', 'Clauding', 'Coalescing',
  'Cogitating', 'Combobulating', 'Composing', 'Computing', 'Concocting', 'Considering', 'Contemplating',
  'Cooking', 'Crafting', 'Creating', 'Crystallizing', 'Cultivating', 'Crunching', 'Deciphering',
  'Deliberating', 'Determining', 'Dilly-dallying', 'Discombobulating', 'Doing', 'Doodling', 'Drizzling',
  'Ebbing', 'Effecting', 'Elucidating', 'Embellishing', 'Enchanting', 'Envisioning', 'Evaporating',
  'Fermenting', 'Fiddle-faddling', 'Finagling', 'Flambéing', 'Flibbertigibbeting', 'Flowing',
  'Flummoxing', 'Fluttering', 'Forging', 'Forming', 'Frosting', 'Frolicking', 'Gallivanting', 'Galloping',
  'Garnishing', 'Generating', 'Germinating', 'Gitifying', 'Grooving', 'Gusting', 'Harmonizing', 'Hashing',
  'Hatching', 'Herding', 'Hibernating', 'Honking', 'Hullaballooing', 'Hyperspacing', 'Ideating', 'Imagining',
  'Improvising', 'Incubating', 'Inferring', 'Infusing', 'Ionizing', 'Jitterbugging', 'Julienning', 'Kneading',
  'Leavening', 'Levitating', 'Lollygagging', 'Manifesting', 'Marinating', 'Meandering', 'Metamorphosing',
  'Misting', 'Moonwalking', 'Moseying', 'Mulling', 'Mustering', 'Musing', 'Nebulizing', 'Nesting', 'Noodling',
  'Nucleating', 'Orbiting', 'Orchestrating', 'Osmosing', 'Perambulating', 'Percolating', 'Perusing',
  'Philosophising', 'Photosynthesizing', 'Pollinating', 'Pontificating', 'Pondering', 'Pouncing',
  'Precipitating', 'Prestidigitating', 'Processing', 'Proofing', 'Propagating', 'Puttering', 'Puzzling',
  'Quantumizing', 'Razzle-dazzling', 'Razzmatazzing', 'Recombobulating', 'Reticulating', 'Roosting',
  'Ruminating', 'Sautéing', 'Scampering', 'Scheming', 'Schlepping', 'Scurrying', 'Seasoning', 'Shenaniganing',
  'Shimmying', 'Simmering', 'Skedaddling', 'Sketching', 'Slithering', 'Smooshing', 'Sock-hopping', 'Spelunking',
  'Spinning', 'Sprouting', 'Stewing', 'Sublimating', 'Sussing', 'Swirling', 'Swooping', 'Symbioting',
  'Synthesizing', 'Tempering', 'Thinking', 'Thundering', 'Tinkering', 'Tomfoolering', 'Topsy-turvying',
  'Transfiguring', 'Transmuting', 'Twisting', 'Undulating', 'Unfurling', 'Unravelling', 'Vibing', 'Waddling',
  'Wandering', 'Warping', 'Whatchamacalliting', 'Whirlpooling', 'Whirring', 'Whisking', 'Wibbling', 'Working',
  'Wrangling', 'Zesting', 'Zigzagging',
];

const ThinkingBlockImpl: React.FC<ThinkingBlockProps> = ({
  isThinking = false,
  thoughtText = '',
  durationSeconds = 0,
  defaultExpanded,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded ?? false);
  const [elapsed, setElapsed] = useState(0);
  const [settledSeconds, setSettledSeconds] = useState<number | null>(null);
  const [verbIndex, setVerbIndex] = useState(() => Math.floor(Math.random() * VERBS.length));
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!isThinking) {
      if (startedAtRef.current > 0) {
        setSettledSeconds(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
        startedAtRef.current = 0;
      }
      return;
    }
    startedAtRef.current = Date.now();
    setSettledSeconds(null);
    setElapsed(0);
    setVerbIndex(Math.floor(Math.random() * VERBS.length));
    const id = window.setInterval(() => {
      if (startedAtRef.current > 0) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [isThinking]);

  useEffect(() => {
    if (!isThinking) return;
    const id = window.setInterval(() => {
      setVerbIndex((i) => (i + 1) % VERBS.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [isThinking]);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  const verb = VERBS[verbIndex % VERBS.length];
  const liveText = `${verb}…${elapsed > 0 ? ` ${elapsed}s` : ''}`;
  const doneSeconds = durationSeconds > 0 ? durationSeconds : (settledSeconds ?? elapsed);

  return (
    <div className={`flex flex-col gap-1.5 select-none ${className}`}>
      <button
        type="button"
        onClick={toggleExpand}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] hover:bg-current/[0.06] active:scale-95 transition-all duration-150 cursor-pointer self-start group ${
          isThinking ? 'text-current' : 'text-current/40 hover:text-current/80'
        }`}
      >
        {isThinking ? (
          <>
            <OrbitLoader size={16} className="text-current/90" />
            <span key={verb} className="an-verb-swap">
              <TextShimmer duration={1.5} className="text-[12px] font-medium font-['Geist'] tracking-tight select-none leading-none">
                {liveText}
              </TextShimmer>
            </span>
          </>
        ) : (
          <span className="text-[12px] font-medium font-['Geist'] tracking-tight select-none leading-none">
            Thought for {doneSeconds}s
          </span>
        )}

        <span
          className={`material-symbols-outlined text-[15px] leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isExpanded ? 'rotate-90' : 'rotate-0'
          } ${isThinking ? 'text-current/90' : 'text-current/40'}`}
        >
          chevron_right
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
      >
        <div className="overflow-hidden">
          <div
            className="rounded-xl bg-current/[0.05] px-3.5 py-2.5 max-w-full text-[12px] font-['Geist'] text-current leading-relaxed tracking-tight select-text font-medium border-0 shadow-none"
          >
            {isThinking && !thoughtText ? (
              <span className="text-current/50">Reasoning…</span>
            ) : (
              thoughtText
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ThinkingBlock = React.memo(ThinkingBlockImpl);
ThinkingBlock.displayName = 'ThinkingBlock';

export default ThinkingBlock;
