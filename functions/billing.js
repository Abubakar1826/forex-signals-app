const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { google } = require("googleapis");
const crypto = require("crypto");

const db = getFirestore();

const PACKAGE_NAME = "com.abubakar1826.forexsignals";
const PRODUCT_ID = "premium_monthly";

const ALLOWED_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",
]);

exports.verifyPlaySubscription = onCall(
  {
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Please sign in before verifying your subscription."
      );
    }

    const uid = request.auth.uid;
    const purchaseToken = request.data?.purchaseToken;
    const productId = request.data?.productId;

    if (
      typeof purchaseToken !== "string" ||
      purchaseToken.length < 10 ||
      purchaseToken.length > 4096
    ) {
      throw new HttpsError(
        "invalid-argument",
        "A valid Google Play purchase token is required."
      );
    }

    if (productId !== PRODUCT_ID) {
      throw new HttpsError(
        "invalid-argument",
        "The subscription product ID is not supported."
      );
    }

    try {
      const auth = new google.auth.GoogleAuth({
        scopes: [
          "https://www.googleapis.com/auth/androidpublisher",
        ],
      });

      const publisher = google.androidpublisher({
        version: "v3",
        auth,
      });

      const result =
        await publisher.purchases.subscriptionsv2.get({
          packageName: PACKAGE_NAME,
          token: purchaseToken,
        });

      const subscription = result.data;
      const lineItems = subscription.lineItems || [];

      const item = lineItems.find(
        (entry) => entry.productId === PRODUCT_ID
      );

      const expiryTime = item?.expiryTime || null;
      const expiryMillis = expiryTime
        ? Date.parse(expiryTime)
        : 0;

      const state = subscription.subscriptionState || "";

      const isActive =
        ALLOWED_STATES.has(state) &&
        Number.isFinite(expiryMillis) &&
        expiryMillis > Date.now();

      const tokenHash = crypto
        .createHash("sha256")
        .update(purchaseToken)
        .digest("hex");

      const tokenRef = db
        .collection("playPurchaseTokens")
        .doc(tokenHash);

      const entitlementRef = db
        .collection("premiumEntitlements")
        .doc(uid);

      await db.runTransaction(async (transaction) => {
        const tokenSnapshot =
          await transaction.get(tokenRef);

        if (
          tokenSnapshot.exists &&
          tokenSnapshot.data().uid !== uid
        ) {
          throw new HttpsError(
            "permission-denied",
            "This purchase is already linked to another account."
          );
        }

        transaction.set(
          tokenRef,
          {
            uid,
            productId: PRODUCT_ID,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        transaction.set(
          entitlementRef,
          {
            uid,
            productId: PRODUCT_ID,
            premiumStatus: isActive ? "ACTIVE" : "INACTIVE",
            expiryTime,
            subscriptionState: state,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      if (
        isActive &&
        subscription.acknowledgementState ===
          "ACKNOWLEDGEMENT_STATE_PENDING"
      ) {
        try {
          await publisher.purchases.subscriptions.acknowledge({
            packageName: PACKAGE_NAME,
            subscriptionId: PRODUCT_ID,
            token: purchaseToken,
            requestBody: {},
          });
        } catch (ackError) {
          console.error(
            "Subscription acknowledgement failed:",
            ackError.message
          );
        }
      }

      return {
        verified: true,
        premiumActive: isActive,
        expiryTime,
        subscriptionState: state,
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error(
        "Google Play subscription verification failed:",
        error.message
      );

      throw new HttpsError(
        "internal",
        "Unable to verify the Google Play subscription."
      );
    }
  }
);
exports.getPremiumStatus = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Please sign in first."
      );
    }

    const snapshot = await db
      .collection("premiumEntitlements")
      .doc(request.auth.uid)
      .get();

    if (!snapshot.exists) {
      return { premiumActive: false };
    }

    const entitlement = snapshot.data();

    const expiry = entitlement.expiryTime
      ? Date.parse(entitlement.expiryTime)
      : 0;

    const premiumActive =
      entitlement.premiumStatus === "ACTIVE" &&
      Number.isFinite(expiry) &&
      expiry > Date.now();

    return { premiumActive };
  }
);
