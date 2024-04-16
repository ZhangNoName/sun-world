import { ZIconCard } from "../components/card";
import "./index.scss";

export const HomePage = () => {
  return (
    <div className="z-icon-home">
      <div className="z-home-header">Header</div>
      <div className="z-home-content">
        <ZIconCard />
      </div>
      <div className="z-home-footer">Footer</div>
    </div>
  );
};
