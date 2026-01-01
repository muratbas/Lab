"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket;

export const getSocket = () => {
  if (!socket) {
    socket = io({
      path: "/api/socket/io",
      addTrailingSlash: false,
    });
  }
  return socket;
};
