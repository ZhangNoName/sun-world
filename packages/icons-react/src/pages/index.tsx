import { isValidElement } from "react";
import { ZIconCard } from "../components/card";
import { IconsList, initIcon } from "./index.data";
import "./index.scss";

export const HomePage = () => {
  console.log("icons列表", IconsList);
  return (
    <div className="z-icon-home">
      <div className="z-home-header">Header</div>
      <div className="z-home-content">
        {IconsList.map((Item, index) => {
          console.log(index, isValidElement(Item));
          // return <ZIconCard key={index} icon={initIcon(item, {})}></ZIconCard>;
          return <Item></Item>;
        })}
      </div>
      <div className="z-home-footer">Footer</div>
    </div>
  );
};
