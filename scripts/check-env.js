const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return new Set();
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const variables = new Set();
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
            const parts = trimmedLine.split('=');
            if (parts.length > 0) {
                variables.add(parts[0]);
            }
        }
    }
    return variables;
}

function main() {
    const rootDir = path.join(__dirname, '..');
    const sampleEnvPath = path.join(rootDir, '.env.sample');
    const sampleVariables = parseEnvFile(sampleEnvPath);

    const envDir = path.join(rootDir, '.env');
    const envFiles = fs.readdirSync(envDir).filter(file => file.startsWith('.env.') && file !== '.env.sample' && !file.endsWith('.backup'));

    let inconsistentFiles = 0;

    for (const envFile of envFiles) {
        console.log(`Checking ${envFile}...`);
        const envFilePath = path.join(envDir, envFile);
        const envVariables = parseEnvFile(envFilePath);

        const missingInEnv = [...sampleVariables].filter(v => !envVariables.has(v));
        const extraInEnv = [...envVariables].filter(v => !sampleVariables.has(v));

        if (missingInEnv.length > 0 || extraInEnv.length > 0) {
            inconsistentFiles++;
            console.error(`Inconsistencies found in ${envFile}:`);
            if (missingInEnv.length > 0) {
                console.error('  Missing variables:', missingInEnv.join(', '));
            }
            if (extraInEnv.length > 0) {
                console.error('  Extra variables:', extraInEnv.join(', '));
            }
        } else {
            console.log(`  ${envFile} is consistent with .env.sample.`);
        }
    }

    if (inconsistentFiles > 0) {
        console.error(`\nFound inconsistencies in ${inconsistentFiles} environment file(s).`);
        process.exit(1);
    } else {
        console.log('\nAll environment files are consistent with .env.sample.');
    }
}

main();
