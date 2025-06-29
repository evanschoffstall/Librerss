import { Button } from "primereact/button";
import React from "react";

interface ButtonBarProps {
  onRefresh: () => void;
  loading?: boolean;
}

const ButtonBar: React.FC<ButtonBarProps> = ({ onRefresh, loading = false }) => {
  return (
    <div className="flex justify-end mb-4">
      <Button
        label="Refresh"
        icon="pi pi-refresh"
        onClick={onRefresh}
        className="p-button-secondary"
        loading={loading}
        disabled={loading}
      />
    </div>
  );
};

export default ButtonBar;
