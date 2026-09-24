const {
  onDocumentCreated,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

const EXPO_PUSH_URL =
  "https://exp.host/--/api/v2/push/send";

const EXPO_RECEIPTS_URL =
  "https://exp.host/--/api/v2/push/getReceipts";


function isEligibleUser(fields) {
  const enabled =
    fields.notificationEnabled !== false;

  const userType =
    String(fields.userType || "TRIAL").toUpperCase();

  const trialStatus =
    String(fields.trialStatus || "ACTIVE").toUpperCase();

  const premiumStatus =
    String(fields.premiumStatus || "").toUpperCase();

  return (
    enabled &&
    (
      userType === "TRIAL" ||
      userType === "PREMIUM" ||
      trialStatus === "ACTIVE" ||
      premiumStatus === "ACTIVE"
    )
  );
}


async function getExpoTokens() {
  const snapshot =
    await db.collection("users").get();

  const tokens = new Set();

  snapshot.forEach((doc) => {
    const fields = doc.data();

    const token =
      fields.expoPushToken;

    if (
      isEligibleUser(fields) &&
      typeof token === "string" &&
      token.startsWith("ExponentPushToken[")
    ) {
      tokens.add(token);
    }
  });

  return [...tokens];
}


/* SEND PUSH + CHECK EXPO RECEIPT */

async function sendExpoNotifications(
  tokens,
  title,
  body,
  data
) {
  if (!tokens.length) {
    console.log(
      "NO ELIGIBLE EXPO PUSH TOKENS FOUND"
    );
    return;
  }

  const messages =
    tokens.map((to) => ({
      to,
      sound: "default",
      title,
      body,
      priority: "high",
      channelId: "signals",
      data,
    }));

  console.log(
    "Sending Expo messages:",
    messages.length
  );

  const response =
    await fetch(
      EXPO_PUSH_URL,
      {
        method: "POST",

        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },

        body:
          JSON.stringify(messages),
      }
    );

  const result =
    await response.json();

  console.log(
    "EXPO TICKET RESPONSE:",
    JSON.stringify(result)
  );

  if (!response.ok) {
    throw new Error(
      "Expo Push API HTTP " +
      response.status
    );
  }


  /* GET TICKET IDS */

  const ticketIds =
    (result.data || [])
      .filter(
        (ticket) =>
          ticket.status === "ok" &&
          ticket.id
      )
      .map(
        (ticket) => ticket.id
      );


  if (!ticketIds.length) {
    console.log(
      "NO SUCCESSFUL EXPO TICKET IDS."
    );
    return;
  }


  /* WAIT BEFORE CHECKING RECEIPTS */

  await new Promise(
    (resolve) =>
      setTimeout(resolve, 10000)
  );


  const receiptResponse =
    await fetch(
      EXPO_RECEIPTS_URL,
      {
        method: "POST",

        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          ids: ticketIds,
        }),
      }
    );


  const receiptResult =
    await receiptResponse.json();


  console.log(
    "EXPO RECEIPT RESPONSE:",
    JSON.stringify(receiptResult)
  );


  if (!receiptResponse.ok) {
    throw new Error(
      "Expo Receipt API HTTP " +
      receiptResponse.status
    );
  }
}


/* =========================
   NEW SIGNAL
========================= */

exports.onNewSignal =
  onDocumentCreated(
    "signals/{signalId}",
    async (event) => {

      const snapshot =
        event.data;

      if (!snapshot) {
        return;
      }

      const signal =
        snapshot.data();

      if (
        String(signal.status || "")
          .toUpperCase() !== "OPEN"
      ) {
        console.log(
          "Ignoring non-OPEN signal."
        );
        return;
      }

      const tokens =
        await getExpoTokens();

      await sendExpoNotifications(
        tokens,

        "🔔 NEW SIGNAL — FOREX SIGNALS 800 PIPS",

        `${signal.pair || ""} ${
          signal.type || ""
        } @ ${signal.entry || ""}`,

        {
          type: "NEW_SIGNAL",

          signalId:
            signal.id || "",

          pair:
            signal.pair || "",

          direction:
            signal.type || "",

          entry:
            signal.entry || "",
        }
      );
    }
  );


/* =========================
   CLOSED SIGNAL
========================= */

exports.onSignalClosed =
  onDocumentUpdated(
    "signals/{signalId}",
    async (event) => {

      const before =
        event.data?.before?.data();

      const after =
        event.data?.after?.data();

      if (!before || !after) {
        return;
      }

      const wasClosed =
        String(before.status || "")
          .toUpperCase() === "CLOSED";

      const isClosed =
        String(after.status || "")
          .toUpperCase() === "CLOSED";

      if (wasClosed || !isClosed) {
        return;
      }

      const tokens =
        await getExpoTokens();

      await sendExpoNotifications(
        tokens,

        "🔔 SIGNAL CLOSED — FOREX SIGNALS 800 PIPS",

        `${after.pair || ""} @ ${
          after.closedPrice || ""
        }`,

        {
          type:
            "CLOSED_SIGNAL",

          signalId:
            after.id || "",

          pair:
            after.pair || "",

          direction:
            after.type || "",

          closedPrice:
            after.closedPrice || "",
        }
      );
    }
  );
