import { FC, ReactNode } from "react";
import "./index.scss";

interface ZIconCardProps {
  icon: ReactNode;
}
export const ZIconCard: FC<ZIconCardProps> = ({ icon }) => {
  return (
    <>
      <div className="z-icon-card-container">{icon}</div>
    </>
  );
};
