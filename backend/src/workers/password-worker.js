const { parentPort } = require("node:worker_threads");
const bcrypt = require("bcryptjs");

parentPort.on("message", ({ id, operation, password, rounds, encodedHash }) => {
  try {
    const result = operation === "hash"
      ? bcrypt.hashSync(password, rounds)
      : operation === "compare"
        ? bcrypt.compareSync(password, encodedHash)
        : undefined;
    if (result === undefined) throw new Error("Unsupported password operation");
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
