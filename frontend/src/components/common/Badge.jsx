import React from 'react';
import { DIFF_MAP, STATUS_MAP } from '../../data/initialData';

export default function Badge({ type, value, className = '', style = {} }) {
  if (type === 'difficulty') {
    const diff = DIFF_MAP[value] || DIFF_MAP.Easy;
    return (
      <span
        className={`font-mono text-fs-10-5 font-medium px-2 py-sp-2 rounded-md inline-block border ${className}`}
        style={{
          color: diff.c,
          backgroundColor: diff.bg,
          borderColor: diff.bd,
          ...style
        }}
      >
        {diff.l}
      </span>
    );
  }

  if (type === 'status') {
    const status = STATUS_MAP[value] || STATUS_MAP['Not started'];
    return (
      <span
        className={`font-mono text-fs-11 inline-flex items-center gap-1 ${className}`}
        style={{
          color: status.c,
          ...style
        }}
      >
        {status.l}
      </span>
    );
  }

  return null;
}
