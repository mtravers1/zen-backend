# DEK Re-encryption Script

This script is used to re-encrypt all user Data Encryption Keys (DEKs) with a new Key Encryption Key (KEK). This is a critical operation that should only be performed after a KEK has been compromised and a new one has been created.

## Safety Features

This script includes several safety features to minimize the risk of data loss:

*   **Backup:** Before modifying a key, the script creates a backup of the original encrypted DEK in a `backup` directory in the Google Cloud Storage bucket.
*   **Verification:** After re-encrypting a DEK, the script immediately attempts to decrypt it with the new KEK to verify the integrity of the new key. If verification fails, the script will halt and report the error, leaving the original DEK untouched.
*   **Single-User Mode:** You can run the script for a single user to test the process before running it on all users.
*   **Dry-Run Mode:** You can run the script in dry-run mode to simulate the process without modifying any files.

## Usage

1.  **Set Environment Variables:**

    Before running the script, you must set the following environment variables for the **new** KEK:

    ```
    NEW_GCP_PROJECT_ID=<your-new-project-id>
    NEW_GCP_KEY_LOCATION=<your-new-key-location>
    NEW_GCP_KEY_RING=<your-new-key-ring>
    NEW_GCP_KEY_NAME=<your-new-key-name>
    ```

2.  **Recommended Workflow:**

    1.  Test the script on a single, non-critical user in **dry-run mode**:

        ```bash
        node scripts/re-encrypt-deks.js --dry-run --uid <user_id>
        ```

    2.  Test the script on a single, non-critical user in **execute mode**:

        ```bash
        node scripts/re-encrypt-deks.js --execute --uid <user_id>
        ```

    3.  Run the script for all users in **dry-run mode**:

        ```bash
        node scripts/re-encrypt-deks.js --dry-run
        ```

    4.  Finally, run the script for all users in **execute mode**:

        ```bash
        node scripts/re-encrypt-deks.js --execute
        ```
