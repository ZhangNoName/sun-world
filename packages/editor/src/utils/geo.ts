/**
 * 格式化角度
 * @param degree 角度，范围为 [0, 360)
 * @returns 格式化后的角度，范围为 [0, 360)
 */
export const normalizeDegree = (degree: number): number => {
  degree = degree % 360;
  if (degree < 0) {
    degree += 360;
  }
  return degree;
};