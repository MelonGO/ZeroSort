import React, { useId } from "react";

interface ZeroSortIconProps extends React.SVGProps<SVGSVGElement> {
  /** Whether the internal bars should animate continuously. */
  animated?: boolean;
}

/**
 * Renders the ZeroSort brand mark.
 */
export const ZeroSortIcon: React.FC<ZeroSortIconProps> = ({
  animated = false,
  width = 600,
  height = 600,
  ...props
}) => {
  // Generate a unique ID for the gradient to prevent conflicts if multiple icons exist
  const gradientId = useId();
  const safeId = `fullGradient-${gradientId.replace(/:/g, "")}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 600 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient
          id={safeId}
          x1="0"
          y1="0"
          x2="600"
          y2="600"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#333333" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
      </defs>

      {animated && (
        <style>
          {`
          @keyframes pump {
            0% { 
                transform: scale(1); 
                opacity: 0.6; /* Starts dimmer */
            }
            50% { 
                transform: scale(1.25); /* Grows significantly larger */
                opacity: 1;   /* Flashes to full brightness */
            }
            100% { 
                transform: scale(1); 
                opacity: 0.6; 
            }
          }
          
          .animated-z-bar {
            transform-box: fill-box;
            transform-origin: center;
            /* Speed increased from 3.0s to 2.0s */
            animation: pump 2.0s ease-in-out infinite; 
          }
        `}
        </style>
      )}

      <g transform="translate(50, 50) scale(0.694444)">
        {/* Centering Wrapper */}
        <g transform="translate(104, 75)">
          <g stroke={`url(#${safeId})`} fill={`url(#${safeId})`}>
            {/* The Z Shape */}
            <path
              d="M50 60 L462 60 L50 520 L462 520"
              strokeWidth="100"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {/* Internal Bars (Left Stack) */}
            <g stroke="none">
              <rect
                className={animated ? "animated-z-bar" : undefined}
                style={animated ? { animationDelay: "0.6s" } : undefined}
                x="10"
                y="140"
                width="240"
                height="65"
                rx="32.5"
              />
              <rect
                className={animated ? "animated-z-bar" : undefined}
                style={animated ? { animationDelay: "0.4s" } : undefined}
                x="10"
                y="235"
                width="160"
                height="65"
                rx="32.5"
              />
              <rect
                className={animated ? "animated-z-bar" : undefined}
                style={animated ? { animationDelay: "0.2s" } : undefined}
                x="10"
                y="325"
                width="90"
                height="65"
                rx="32.5"
              />
            </g>

            {/* Internal Bars (Right Stack) */}
            <g stroke="none">
              <rect
                className={animated ? "animated-z-bar" : undefined}
                style={animated ? { animationDelay: "0.8s" } : undefined}
                x="410"
                y="200"
                width="90"
                height="65"
                rx="32.5"
              />
              <rect
                className={animated ? "animated-z-bar" : undefined}
                style={animated ? { animationDelay: "1.0s" } : undefined}
                x="340"
                y="290"
                width="160"
                height="65"
                rx="32.5"
              />
              <rect
                className={animated ? "animated-z-bar" : undefined}
                style={animated ? { animationDelay: "1.2s" } : undefined}
                x="250"
                y="380"
                width="240"
                height="65"
                rx="32.5"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
};
