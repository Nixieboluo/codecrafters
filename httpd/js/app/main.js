const net = require("net");
const path = require("path");
const fs = require("fs");

const HTTP_STATUS = new Map([
    [200, "OK"],
    [201, "Created"],
    [400, "Bad Request"],
    [404, "Not Found"],
    [500, "Internal Server Error"],
]);

function getHttpStatusString(code) {
    if (HTTP_STATUS.has(code)) return code + " " + HTTP_STATUS.get(code);
    return code + " " + "I don't know this code";
}

/**
 * Hnadles request
 * @param {Buffer} buf Data received
 * @param {net.Socket} socket Socket object
 */
function handleRequest(buf, socket) {
    const data = buf.toString();
    const req = parseHttpRequest(data);

    console.log({ req });

    // Simple error handling
    if (req.isError) {
        writeResponse(socket, buildResponseString(400));
        return;
    }

    // 200 OK on /
    if (req.queryString === "/") {
        writeResponse(socket, buildResponseString(200));
    }
    // Echo on /echo/xxx
    else if (req.queryString.startsWith("/echo/")) {
        const body = req.queryString.slice(6);
        writeResponse(
            socket,
            buildResponseString(200, body, {
                "Content-Type": "text/plain",
                "Content-Length": Buffer.byteLength(body, "utf-8"),
            })
        );
    }
    // Return user agent on /user-agent
    else if (req.queryString === "/user-agent") {
        const body = req.headers["User-Agent"] ?? "";
        writeResponse(
            socket,
            buildResponseString(200, body, {
                "Content-Type": "text/plain",
                "Content-Length": Buffer.byteLength(body, "utf-8"),
            })
        );
    }
    // Serve files on /files/
    else if (req.queryString.startsWith("/files/")) {
        const filePath = path.join(argDir, req.queryString.slice(7));

        if (req.method === "GET") {
            if (!fs.existsSync(filePath)) {
                writeResponse(socket, buildResponseString(404));
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    const body = err.message;
                    writeResponse(
                        socket,
                        buildResponseString(500, body, {
                            "Content-Type": "text/plain",
                            "Content-Length": Buffer.byteLength(body, "utf-8"),
                        })
                    );
                } else {
                    const body = data.toString("binary");
                    writeResponse(
                        socket,
                        buildResponseString(200, body, {
                            "Content-Type": "application/octet-stream",
                            "Content-Length": Buffer.byteLength(body, "utf-8"),
                        })
                    );
                }
            });
        } else if (req.method === "POST") {
            console.log({ body: req.body });
            fs.writeFile(filePath, req.body, (err) => {
                if (err) {
                    const body = err.message;
                    writeResponse(
                        socket,
                        buildResponseString(500, body, {
                            "Content-Type": "text/plain",
                            "Content-Length": Buffer.byteLength(body, "utf-8"),
                        })
                    );
                } else writeResponse(socket, buildResponseString(201));
            });
        }
    }
    // 404 Not Found on other paths
    else {
        writeResponse(socket, buildResponseString(404));
    }
}

/**
 * Parses HTTP request
 * @param {string} data HTTP request string
 */
function parseHttpRequest(data) {
    const statusEnd = data.indexOf("\r\n");
    const statusLine = data.slice(0, statusEnd).trim();
    const [method, queryString, protocol] = statusLine.split(" ");

    // Simple validation
    if (protocol !== "HTTP/1.1")
        return {
            isError: true,
        };

    const headersEnd = data.indexOf("\r\n\r\n", statusEnd + 1);
    const headersRaw = data.slice(statusEnd + 1, headersEnd);
    const headers = headersRaw
        // Split into lines
        .split("\r\n")
        // Parse key and value
        .reduce((acc, cur) => {
            const delimiterPos = cur.indexOf(":");
            const key = cur.slice(0, delimiterPos);
            const value = cur.slice(delimiterPos + 2);

            acc[key] = value;
            return acc;
        }, {});

    const body = data.slice(headersEnd + 4);

    return {
        isError: false,
        method,
        queryString,
        protocol,
        headers,
        body,
    };
}

/**
 * Builds HTTP response
 * @param {number} status
 * @param {string} body
 * @param {Record<string, string>} headers
 */
function buildResponseString(status = 200, body = "", headers = {}) {
    const resp = [];

    // First line
    resp.push(`HTTP/1.1 ${getHttpStatusString(status)}`);

    // Headers
    resp.push(
        ...Object.entries(headers).map(
            ([header, value]) => `${header}: ${value}`
        )
    );
    resp.push("");

    // Body
    resp.push(body);

    console.log({ resp });
    return resp.join("\r\n");
}

/**
 * Writes response and close the connection
 * @param {net.Socket} socket socket object
 * @param {string} data resp string
 */
function writeResponse(socket, data) {
    socket.write(data);
    socket.end();
}

// Parse commandline args
const args = process.argv.slice(2);
const argDirIndex = args.findIndex((i) => i === "--directory");
const argDir = argDirIndex >= 0 ? args.at(argDirIndex + 1) : null ?? ".";

if (fs.existsSync(argDir))
    console.log("Serving directory " + argDir + " on /files/");
else throw new Error("Directory " + argDir + " is not exist.");

const server = net.createServer((socket) => {
    socket.on("close", () => {
        console.log("Socked closed.");
        socket.end();
    });

    socket.on("end", () => {
        console.log("Connection ended.");
    });

    socket.on("data", (data) => handleRequest(data, socket));
});

server.listen(4221, "localhost");
console.log("Listening on localhost port 4221");
