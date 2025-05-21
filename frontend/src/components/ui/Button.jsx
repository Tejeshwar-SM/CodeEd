import React from 'react';

const Button = ({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  type = "button",
  className = "",
  onClick,
  ...rest
}) => {
  const baseClasses = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";

  const variantClasses = {
    primary: "bg-primary hover:bg-primary-hover text-white focus:ring-indigo-500",
    secondary: "bg-secondary hover:bg-green-700 text-white focus:ring-green-500",
    danger: "bg-danger hover:bg-red-600 text-white focus:ring-red-500",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-600 focus:ring-gray-500",
    outline: "bg-transparent border border-gray-300 hover:bg-gray-50 text-gray-700 focus:ring-gray-500"
  };

  const sizeClasses = {
    sm: "text-xs px-2.5 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-6 py-3"
  };

  const widthClasses = fullWidth ? "w-full" : "";

  const disabledClasses = disabled
    ? "opacity-50 cursor-not-allowed"
    : "cursor-pointer";

  const buttonClasses = `
    ${baseClasses}
    ${variantClasses[variant] || variantClasses.primary}
    ${sizeClasses[size] || sizeClasses.md}
    ${widthClasses}
    ${disabledClasses}
    ${className}
  `;

  return (
    <button
      type={type}
      className={buttonClasses}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;