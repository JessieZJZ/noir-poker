import React from "react";
// A front-facing shell proportioned to the iPhone capture. The Dynamic Island,
// time and status icons are already in the recording; never draw them twice.
export const IPhoneFrame = ({
  children,
  width,
  height,
}: {
  children: React.ReactNode;
  width: number;
  height: number;
}) => (
  <div style={{ position: "relative", width, height }}>
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transformOrigin: "0 0",
        transform: `scale(${width / 394},${height / 830})`,
        width: 394,
        height: 830,
        borderRadius: 64,
        background:
          "linear-gradient(112deg,#b4aea1 0%,#605d56 7%,#c9c7be 22%,#3f4141 45%,#878780 69%,#d3d0c6 84%,#535651 98%)",
        boxShadow:
          "0 24px 50px #010706a8,inset 0 0 0 1.8px #cac9c2,inset 0 0 0 4px #494c49,inset 0 0 0 6px #121513",
      }}
    >
      {[
        { left: -3, top: 129, height: 22 },
        { left: -3, top: 186, height: 53 },
        { left: -3, top: 254, height: 53 },
        { right: -3, top: 211, height: 86 },
      ].map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 4,
            borderRadius: 2,
            background: "linear-gradient(90deg,#3b3c38,#9b9b94,#444642)",
            ...s,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: "8px 10px",
          background: "#030605",
          borderRadius: 56,
          overflow: "hidden",
          boxShadow: "0 0 0 2px #0a0b0b",
        }}
      >
        {children}
      </div>
    </div>
  </div>
);
