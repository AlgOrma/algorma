import React from 'react';

export default function Button({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = '',
  style = {},
  ...props 
}) {
  const baseClasses = "font-sans text-fs-13-5 font-medium rounded-card-btn cursor-pointer inline-flex items-center justify-center gap-sp-7 transition-all duration-150 outline-none border";
  
  let variantClasses = "";
  if (variant === 'primary') {
    variantClasses = "text-black bg-white border-white px-sp-15 py-sp-10 hover:bg-white/90";
  } else if (variant === 'secondary') {
    variantClasses = "text-white bg-black border-border-btn px-sp-15 py-sp-10 hover:bg-bg-btn-sec-hover hover:border-border-btn-hover";
  } else if (variant === 'ghost') {
    variantClasses = "text-text-muted bg-transparent border-transparent px-sp-10 py-sp-5 hover:text-white";
  }

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variantClasses} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}
