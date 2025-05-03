module.exports = {
    apps: [
        {
            name: "dev",
            script: "./index.js",
            watch: true,
            node_args: "--env-file=.env",
            error_file: "/var/log/zentavos/api-error.log",
            out_file: "/var/log/zentavos/api-out.log",
            log_date_format: "YYYY-MM-DD HH:mm Z",
        },
        {
            name: "testing",
            script: "./index.js",
            watch: true,
            node_args: "--env-file=.env",
            error_file: "/var/log/zentavos/api-error.log",
            out_file: "/var/log/zentavos/api-out.log",
            log_date_format: "YYYY-MM-DD HH:mm Z",
        },
        {
            name: "uat",
            script: "./index.js",
            watch: true,
            node_args: "--env-file=.env",
            error_file: "/var/log/zentavos/api-error.log",
            out_file: "/var/log/zentavos/api-out.log",
            log_date_format: "YYYY-MM-DD HH:mm Z",
        },
        {
            name: "prod",
            script: "./index.js",
            watch: true,
            node_args: "--env-file=.env"
        },
    ]
}