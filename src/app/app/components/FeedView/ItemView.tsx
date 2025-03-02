import { DataView } from "primereact/dataview";
import React from "react";
import Item from "./Item";

interface ItemViewProps {
  feed: any[];
}

const ItemView: React.FC<ItemViewProps> = ({ feed }) => {
  return (
    <div className="md:w-3/4">
      <DataView value={feed} itemTemplate={(item) => <Item item={item} />} layout="list" />
    </div>
  );
};

export default ItemView;
