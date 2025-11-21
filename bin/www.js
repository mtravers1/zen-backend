#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config();

/**
 * Module dependencies.
 */
import createApp from "../app.js";
import Debug from "debug";
const debug = Debug("zentavos-backend:server");
import http from "http";
import connectDB from "../database/database.js";

let server; // Hoisted server declaration

/**
 * Get port from environment and store in Express.
 */

async function startServer() {
  await connectDB();

  const expressApp = await createApp();

  const port = normalizePort(process.env.APP_PORT || "3000");
  expressApp.set("port", port);

  /**
   * Create HTTP server.
   */

  server = http.createServer(expressApp);

  /**
   * Listen on provided port, on all network interfaces. 
   */

  server.listen(port);
  server.on("error", (error) => onError(error, port));
  server.on("listening", () => onListening(expressApp));
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  let port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error, port) {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Formatting functions
 */
function _print(path, layer) {
  if (layer.route) {
    layer.route.stack.forEach(
      _print.bind(null, path.concat(_split(layer.route.path))),
    );
  } else if (layer.name === "router" && layer.handle.stack) {
    layer.handle.stack.forEach(
      _print.bind(null, path.concat(_split(layer.regexp))),
    );
  } else if (layer.method) {
    console.log(
      "%s /%s",
      layer.method.toUpperCase(),
      path.concat(_split(layer.regexp)).filter(Boolean).join("/"),
    );
  }
}

function _split(thing) {
  if (typeof thing === "string") {
    return thing.split("/");
  } else if (thing.fast_slash) {
    return "";
  } else {
    const match = thing
      .toString()
      .replace("\\/?", "")
      .replace("(?=\\/|$)", "$")
      .match(/^\/\^((?:\\[.*+?^${}()|[\]\\\/]|[^.*+?^${}()|[\]\\\/])*)\$\//);
    return match
      ? match[1].replace(/\\(.)/g, "$1").split("/")
      : "<complex:" + thing.toString() + ">";
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */
function onListening(expressApp) {
  const addr = server.address();
  const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;

  // NOTE: This route introspection relies on Express internals and may break in future versions.
  // For a more robust solution, consider using a library like express-list-endpoints.
  try {
    console.log("\nEndpoints:\n");
    expressApp._router.stack.forEach(_print.bind(null, []));
  } catch (e) {
    console.warn("\n⚠️  Could not introspect Express routes. The router shape may have changed.");
    console.warn("Consider using a library like express-list-endpoints for more robust route discovery.");
  }

  console.log("\nListening on " + bind + "...\n");

  debug("Listening on " + bind);
}
