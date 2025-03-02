import { Button } from "primereact/button";
import React from "react";

interface ButtonBarProps {
  onRefresh: () => void;
}

const ButtonBar: React.FC<ButtonBarProps> = ({ onRefresh }) => {
  return (
    <div className="flex justify-end mb-4">
      <Button label="Refresh" icon="pi pi-refresh" onClick={onRefresh} className="p-button-secondary" />
    </div>
  );
};

export default ButtonBar;
