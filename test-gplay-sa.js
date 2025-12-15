
import { JWT } from "google-auth-library";
import fetch from "node-fetch";

const base64ServiceAccount = "ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAiemVudGF2b3MtdWF0IiwKICAicHJpdmF0ZV9rZXlfaWQiOiAiNWVmMjVmZGE2MTEwY2ViZDE4MTNlYzg5YzljZjBiZDAxZDk0ZGY5NCIsCiAgInByaXZhdGVfa2V5IjogIi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZRSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS2N3Z2dTakFnRUFBb0lCQVFDTjM2Njk4ckMzMmJSUlxub0JPWm4wTUR0d1J4eEVFNFkxWWdJcGlTUUl1UnRNTW9lQzIrc0hWNzRGRktHeTNXbkJqU0tSblkwRlUzcUZpRVxuMCtuQXNYSExCVDlnUSs4SGh5Z0xubkpSQ0lMVG5NdjgxN3N1b1QzWWhOMHFQa0VFSURLaXc3U2pBbS9WRVNDR1xuSkxmc2xJUFhJdW1zbGx3NHYzNE1HNW11RUpmREVVb29jZG9xTllESmwwMWxpS21yWlZLSDZCMkJweThVcXVhWVxuVnYrMmFhOWE3OHdSNjB5YnIwZmV2ei81clh1eWVwZnAwT2VqWGUxNllLVlB5NVFzQmVnU0RCSGk0UUdXNmpKMFxubWxzZWZpYzVEZE1UcUg5N1pINDNiM0tBZm92NGlOaEQ0a2Nzd1V1ZU5oRG1FR3VlalREN2svSHZhcEdhWE5aNVxuckZjYzVFZGRBZ01CQUFFQ2dnRUFCcFdhUjU5Y2FNS2VQZ2lRSGFTRGZoMWxHU2pxMUU5Z2wxQUx1b1ByaGxPNFxuUXFmN05ZV24yakV4dDBtcmR3YnZ3YUhkM004UEdXekRJNTBES2xTQjY3MGVzUnpPQlRzcnE3TUs2cXhhc3JBQ1xuVS9CK005NlF0SHhoYmFlNGZ1b2JUTmNJMytUZkpGUVlhVDYwZzRnV3ExVFNqcXVSZEUwYzJ1VXFzaVpSS010OVxuQkU2UkczeW45cit1QUZLeFVXNCtiM3J4NGJ6Y1VtOEhBVUZQejF5MXhJMGxkRDJzMldnMmM1amZad0pKYW03K1xuL3l4anBPd1F6L1YyeldsbUlqZWkyRGxmcmFkVUo0ZXBvTFZ6TzV1Zzk2bjNjdGZxTDgrYlpYOXJzNjg0ZVlPa1xubCtxd2pTVFdaTFJqYm5xTmZEZFVPeTZ1bW5RMWJqWTRQdHhQRit5bDhRS0JnUURDa1lvUW9tQ3VhallEZ2pBbVxuZTV5UTQxSTZ0SXlmTE9xdUZSQm5iNWlaK243QnYvaXlSOWhCM1ZOTG1rTjdhQ2JsenhIMlpadTZ1OEd6ZzdUclxueURJZWZiN1BFT0VZbUxXMFQwN2ZMUnFRUnVnWDRPSE5ibjRqQUhuNnZlRWR1L2VrYVhkcGc4UmdublhKckFqeFxuSVlOSEVPbTFuejZqUGdwYWx4NlE2Wk9wVVFLQmdRQzZxdmNTR1VxUmJwVEJyWmJJcnhhUENqU3ZYZkxBMW1QZlxudjlCbDlWZDVCYWsyejh0R2YyQ0FKNGt6MmZPdEZrakdJUDl4ZzF4ZFpxb2FTT3MzaUo3Wkx0V2lIMnptcnV2Z1xuOG5rQWtFNndYRko4QXgwK2o4dmdITEYxVnExK09QZFlBd1NnaHVxMDdyS1l3Tmd6YkE5SXB2N0krT25nZ2dRb1xuQ0w4eXJiNDZUUUtCZ0dDdFdHRHpqZjZjSDhLV2liNVZaWEpJd2E4UnoxMjRQOVBIKzZLcHZMV2wxaDRIZVZkOFxuZzJRV3lUQ2pzaXc3a0RoWUw2Q3kxREp3NE1xR0F2dTFPZElVd1I2NlVGNmNZb3o1YTBOUmNnV0dkZ1NIWlN0aVxuWDZLY3RmOTFJY3BZZjdCZUIwdVNnWjFRbjA1YUFRZHZrMzlZVkFnKzNDell3dVJJZXBPZXZCUkJBb0dBU2c0cFxubHZTUnNNQytJMWhLeWJNc3IvTE1sQVlobUg5MWYvOEpIbW9IR2V3MUJabktlMTF0VzJwVDlFNHpiaWU1RjJGZlxuOWhpM1BCYk94VDdJa20rUkZYaVBLSkp2RWRXem5ycVRaclhaZ2Y0ZWV6U0JGYURXc1VLdzVHeE95QlN4akNrbVxuWE1rcHRENCtmSHVGU21GRWJ2NVJka25KLzFlVmJveUp6Z0UveHNFQ2dZRUF2ZEN6cXRkNDh3RTFoM0NPbWhtM1xubWQ4Tk9PUGZ1bUE4Y2syVS8xSXBQTlhSalpmUE5abFpOaC9LTUcxck4yU0JqUm1ZZ0orTjQ0eU5GR2NiVjZiV1xuV2w3RStabFg4Uyt2VmhOd01FUHd5RGU1STByTlpvZGMxOTdKTFVrWnQrYmhoMUtvbmsveUwzMW04SEpiQjZWVVxuYjNVVWJDaGR3b212aDVGYmEyc244Z3c9XG4tLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tXG4iLAogICJjbGllbnRfZW1haWwiOiAiemVudGF2b3MtZ3BsYXktc2Etc3RnLTJAemVudGF2b3MtdWF0LmlhbS5nc2VydmljZWFjY291bnQuY29tIiwKICAiY2xpZW50X2lkIjogIjEwMjc4ODc3NzUzNTQxNzk3NDk3OCIsCiAgImF1dGhfdXJpIjogImh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbS9vL29hdXRoMi9hdXRoIiwKICAidG9rZW5fdXJpIjogImh0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuIiwKICAiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL29hdXRoMi92MS9jZXJ0cyIsCiAgImNsaWVudF94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3JvYm90L3YxL21ldGFkYXRhL3g1MDkvemVudGF2b3MtZ3BsYXktc2Etc3RnLTIlNDB6ZW50YXZvcy11YXQuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLAogICJ1bml2ZXJzZV9kb21haW4iOiAiZ29vZ2xlYXBpcy5jb20iCn0K";

const purchaseToken = "kngaakaehhfehfpmnknnflom.AO-J1OyVo-TqHSIS5MeqrzGhHAuUZvA3Dif6Ca4eIZzgeNhBLZ863N8sulSZ2k6jMavJoTWk9jJrq6rOdJL-LJypDUFQhep2dq-R2d2JEK-wQT6HTaYHoPs";
const packageName = "com.zentavos.zentavosuat";
const subscriptionId = "com.zentavos.zentavosuat.founder";

async function testServiceAccount() {
  try {
    console.log("Decoding base64 service account...");
    const serviceAccountJson = Buffer.from(base64ServiceAccount, "base64").toString("utf8");
    const serviceAccount = JSON.parse(serviceAccountJson);
    console.log("🚨 FULL SERVICE ACCOUNT JSON (LOCAL SCRIPT):", JSON.stringify(serviceAccount, null, 2));
    console.log("✅ Service account decoded successfully. Email:", serviceAccount.client_email);
    console.log("🚨 LOCAL SCRIPT IS LOGGED IN AS: " + serviceAccount.client_email); // <--- LOOK AT THIS LOG

    console.log("Authenticating with Google...");
    const client = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    const accessToken = await client.getAccessToken();
    console.log("✅ Successfully obtained access token.");
    const token = accessToken.token;
    console.log(`🚨 LOCAL ACCESS TOKEN (first 10, last 10, length): ${token.substring(0, 10)}...${token.substring(token.length - 10)} (${token.length})`);

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;

    console.log(`
Fetching subscription details from:
${url}
`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        "Content-Type": "application/json",
      },
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("❌ API call failed with status:", response.status);
      console.error(JSON.stringify(responseData, null, 2));
    } else {
      console.log("✅ API call successful!");
      console.log(JSON.stringify(responseData, null, 2));
    }
  } catch (error) {
    console.error("❌ An error occurred during the test:", error);
  }
}

testServiceAccount();
