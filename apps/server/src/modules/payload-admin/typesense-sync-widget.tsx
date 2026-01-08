"use client";

import React from "react";
import { SyncTypesenseButton } from "./sync-typesense-button";

export const TypesenseSyncWidget: React.FC = () => {
  return (
    <div
      style={{
        padding: "20px",
        marginTop: "20px",
        backgroundColor: "#f8fafc",
        borderRadius: "8px",
        border: "1px solid #e2e8f0",
      }}
    >
      <h3
        style={{
          margin: "0 0 8px 0",
          fontSize: "16px",
          fontWeight: 600,
          color: "#1e293b",
        }}
      >
        Typesense Search Index
      </h3>
      <p
        style={{
          margin: "0 0 16px 0",
          fontSize: "14px",
          color: "#64748b",
        }}
      >
        Sincroniza manualmente todos los documentos de Pages con el indice de
        busqueda de Typesense.
      </p>
      <SyncTypesenseButton />
    </div>
  );
};

export default TypesenseSyncWidget;
