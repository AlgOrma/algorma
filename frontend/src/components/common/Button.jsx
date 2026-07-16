import React from 'react';

export default function Button({ 
  children, 
  onClick, 
  variant = 'primary', 
  size = 'md',
  className = '',
  style = {},
  ...props 
}) {
  let baseClasses = "btn-3d font-sans text-fs-13 font-bold select-none cursor-pointer outline-none transition-all duration-100 ease-out";

  let variantClasses = "";
  if (variant === 'primary') {
    variantClasses = "btn-3d-primary";
  } else if (variant === 'secondary') {
    variantClasses = "btn-3d-secondary";
  } else if (variant === 'white') {
    variantClasses = "btn-3d-white";
  } else if (variant === 'green') {
    variantClasses = "btn-3d-green";
  } else if (variant === 'red') {
    variantClasses = "btn-3d-red";
  } else if (variant === 'orange') {
    variantClasses = "btn-3d-orange";
  } else if (variant === 'ghost') {
    baseClasses = "font-sans text-fs-13 font-bold cursor-pointer inline-flex items-center justify-center gap-2 select-none transition-all duration-150 outline-none rounded-lg py-2 px-3.5";
    variantClasses = "text-text-muted bg-transparent border-none hover:text-text-main hover:bg-bg-element-hover";
  }

  if (size === 'sm') {
    baseClasses += " btn-3d-sm";
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
