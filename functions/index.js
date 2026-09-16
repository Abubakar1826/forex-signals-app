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


async function sendExpoNotifications(
  tokens,
  title,
  body,
  data
) {

  if (!tokens.length) {
    console.log(
      "No eligible Expo push tokens found."
    );
    return;
  }


  for (
    let i = 0;
    i < tokens.length;
    i += 100
  ) {

    const batch =
      tokens.slice(i, i + 100);


    const messages =
      batch.map((to) => ({
        to,
        sound: "default",
        title,
        body,
        priority: "high",
        channelId: "signals",
        data,
      }));


    const response =
      await fetch(
        EXPO_PUSH_URL,
        {
          method: "POST",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(messages),
        }
      );


    const result =
      await response.json();


    console.log(
      "Expo push response:",
      response.status,
      result
    );


    if (!response.ok) {
      throw new Error(
        "Expo Push API HTTP " +
        response.status
      );
    }

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


      // Prevent duplicate notification
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
