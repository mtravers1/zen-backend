module.exports = {
    apps: [
        {
            name: "dev",
            script: "./index.js",
            watch: true,
            node_args: "--env-file=.env"
        },
        {
            name: "testing",
            script: "./index.js",
            watch: true,
            node_args: "--env-file=.env"
        },
        {
            name: "uat",
            script: "./index.js",
            watch: true,
            node_args: "--env-file=.env"
        },
        {
            name: "prod",
            script: "./index.js",
            watch: true,
            node_args: "--env-file=.env"
        },
    ]
}