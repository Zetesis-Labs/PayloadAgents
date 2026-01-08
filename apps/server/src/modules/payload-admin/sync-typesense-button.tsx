"use client";

import React, { useState } from "react";
import { Button } from "@payloadcms/ui";

interface SyncResult {
  success: boolean;
  message: string;
  totalDocuments?: number;
  results?: {
    synced: string[];
    errors: string[];
  };
}

export const SyncTypesenseButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/pages/sync-to-typesense", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: SyncResult = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <Button onClick={handleSync} disabled={isLoading}>
        {isLoading ? (
          <>
            <svg
              style={{
                animation: "spin 1s linear infinite",
                width: "16px",
                height: "16px",
                marginRight: "6px",
              }}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                style={{ opacity: 0.25 }}
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                style={{ opacity: 0.75 }}
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Sincronizando con Typesense...
          </>
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: "6px" }}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            Sincronizar con Typesense
          </>
        )}
      </Button>

      {result && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "13px",
            backgroundColor: result.success ? "#dcfce7" : "#fee2e2",
            color: result.success ? "#166534" : "#991b1b",
          }}
        >
          {result.success ? (
            <>
              {result.results?.synced.length || 0} sincronizados,{" "}
              {result.results?.errors.length || 0} errores
            </>
          ) : (
            <>{result.message}</>
          )}
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default SyncTypesenseButton;
