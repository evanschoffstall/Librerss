import React from "react";

interface ItemProps {
  item: { title: string; link: string; content: string };
}

const Item: React.FC<ItemProps> = ({ item }) => {
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer" className="block p-col-12 mb-4 border border-transparent hover:border-gray-500 p-4 transition-all duration-200 text-white no-underline">
      <div className="text-2xl font-bold">{item.title}</div>
      <p className="mt-2 text-gray-200">{item.content}</p>
    </a>
  );
};

export default Item;
