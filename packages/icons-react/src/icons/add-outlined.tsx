import React from "react";
import { ZIconProps } from "../type";
import { DEFAULT_PARAMS } from "../data";

export const AddOutlined: React.FC<ZIconProps> = React.memo(
  ({
    width = DEFAULT_PARAMS.width,
    height = DEFAULT_PARAMS.height,
    color = DEFAULT_PARAMS.color,
  }) => {
    return (
      <svg
        width={width}
        height={height}
        viewBox="0 0 24 24"
        fill={color}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M11 12V17H12V12H17V11H12V6H11V11H6V12H11Z"
        />
      </svg>
    );
  }
);
