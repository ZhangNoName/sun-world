/*
 * @Author: ZhangNoName
 * @Date: 2024-04-11 22:41:03
 * @LastEditors: zxy 1623190186@qq..com
 * @LastEditTime: 2024-04-11 22:44:38
 * @FilePath: \sun-world\packages\icons\src\icons\add-outlined.tsx
 * @Description:
 *
 * Copyright (c) 2024 by ZhangNoName, All Rights Reserved.
 */
import React from "react";
import { ZIconProps } from "../type";
import { DEFAULT_PARAMS } from "../data";

export const AddOutlined = React.memo((props: ZIconProps = DEFAULT_PARAMS) => {
  const { width, height, color } = props;
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
});
