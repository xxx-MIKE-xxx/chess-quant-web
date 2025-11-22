import * as React from "react";

interface WelcomeEmailProps {
  username: string;
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  username,
}) => (
  <div style={{ fontFamily: 'monospace', backgroundColor: '#020617', color: '#cbd5e1', padding: '40px' }}>
    <div style={{ maxWidth: '600px', margin: '0 auto', border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ backgroundColor: '#0f172a', padding: '20px', borderBottom: '1px solid #1e293b' }}>
        <h1 style={{ margin: 0, color: '#fff', fontSize: '20px', letterSpacing: '1px' }}>
          CHESS<span style={{ color: '#10b981' }}>QUANT</span>
        </h1>
      </div>

      {/* Body */}
      <div style={{ padding: '30px' }}>
        <p style={{ fontSize: '16px', lineHeight: '1.5' }}>
          Operator <strong>{username}</strong>,
        </p>
        
        <p style={{ fontSize: '14px', lineHeight: '1.5', color: '#94a3b8' }}>
          Your terminal access has been initialized. The system is now tracking your games for tilt patterns and performance anomalies.
        </p>

        <div style={{ margin: '30px 0', padding: '15px', backgroundColor: '#1e293b', borderLeft: '4px solid #10b981', color: '#fff', fontSize: '14px' }}>
          <strong>Action Required:</strong> Complete your first "Tilt Scan" on the dashboard to calibrate the engine.
        </div>

        <a 
          href="https://chess-quant-web.vercel.app"
          style={{ 
            display: 'inline-block', 
            backgroundColor: '#10b981', 
            color: '#020617', 
            padding: '12px 24px', 
            borderRadius: '6px', 
            textDecoration: 'none', 
            fontWeight: 'bold', 
            fontSize: '14px'
          }}
        >
          ENTER TERMINAL
        </a>
      </div>

      {/* Footer */}
      <div style={{ padding: '20px', backgroundColor: '#020617', borderTop: '1px solid #1e293b', fontSize: '12px', color: '#475569', textAlign: 'center' }}>
        <p>SECURE TRANSMISSION // CHESS QUANT SYSTEMS</p>
      </div>
    </div>
  </div>
);