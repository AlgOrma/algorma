import React, { useMemo } from 'react';

export default function Heatmap({ colorBase = '111, 191, 146', streakDays = 12 }) {
  // Generate a deterministic but organic looking heatmap
  const heatMapGrid = useMemo(() => {
    const buckets = [0.06, 0.06, 0.1, 0.18, 0.18, 0.32, 0.32, 0.48, 0.62, 0.85];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    
    const weeks = [];
    for (let w = 0; w < 16; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        let r = rnd();
        if (d >= 5) r *= 0.5; // less activity on weekends in this mock
        r = Math.min(0.999, r + w / 60); // slightly more active recently
        
        const opacity = buckets[Math.floor(r * buckets.length)];
        days.push(`rgba(${colorBase}, ${opacity})`);
      }
      weeks.push(days);
    }
    return weeks;
  }, [colorBase]);

  return (
    <div className="flex gap-sp-3">
      {heatMapGrid.map((wk, wIdx) => (
        <div key={wIdx} className="flex flex-col gap-sp-3">
          {wk.map((bg, dIdx) => (
            <div
              key={dIdx}
              className="w-sp-13 h-sp-13 rounded-sm transition-colors duration-300"
              style={{
                backgroundColor: bg
              }}
              title={`Week ${wIdx + 1}, Day ${dIdx + 1}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
