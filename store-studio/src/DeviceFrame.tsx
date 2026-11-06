import React from "react";

/** A generic, unbranded metal device housing around unchanged captured pixels. */
export const DeviceFrame: React.FC<{
  children: React.ReactNode;
  width: number;
  height: number;
  tablet?: boolean;
}> = ({ children, width, height, tablet = false }) => {
  const rim = Math.max(7, width * (tablet ? 0.021 : 0.031));
  const corner = width * (tablet ? 0.065 : 0.115);
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: corner,
        background:
          "linear-gradient(115deg,#727b7e 0%,#202728 4%,#4e585c 9%,#121719 31%,#0a0e11 65%,#59656a 94%,#a2acae 100%)",
        padding: rim,
        boxShadow: `0 0 0 1px #b6cbca55, inset 0 0 0 2px #c5cecc50, inset 0 0 0 5px #11191c, 0 ${width * 0.07}px ${width * 0.15}px #000a`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -3,
          top: height * 0.19,
          width: 4,
          height: height * 0.075,
          borderRadius: "4px 0 0 4px",
          background: "linear-gradient(90deg,#647074,#212b2d)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -3,
          top: height * 0.29,
          width: 4,
          height: height * 0.075,
          borderRadius: "4px 0 0 4px",
          background: "linear-gradient(90deg,#647074,#212b2d)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -4,
          top: height * 0.26,
          width: 5,
          height: height * 0.115,
          borderRadius: "0 4px 4px 0",
          background: "linear-gradient(90deg,#171f22,#899195)",
        }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: Math.max(10, corner - rim * 0.65),
          overflow: "hidden",
          background: "#020405",
          border: `${Math.max(2, width * 0.009)}px solid #030607`,
          boxShadow: "0 0 0 1px #b4c8c825",
          position: "relative",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 2,
          borderRadius: corner - 2,
          border: "1px solid #ffffff15",
          pointerEvents: "none",
        }}
      />
    </div>
  );
};
