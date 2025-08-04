#!/bin/bash

# Test runner script for Zentavos Backend
# Usage: ./scripts/run-tests.sh [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TEST_TYPE="all"
WATCH_MODE=false
COVERAGE=false
VERBOSE=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -t, --type TYPE     Test type: all, unit, integration, plaid, auth, accounts, ai"
    echo "  -w, --watch         Run tests in watch mode"
    echo "  -c, --coverage      Generate coverage report"
    echo "  -v, --verbose       Verbose output"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all tests"
    echo "  $0 -t unit           # Run only unit tests"
    echo "  $0 -t plaid -w       # Run Plaid tests in watch mode"
    echo "  $0 -c -v             # Run all tests with coverage and verbose output"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            TEST_TYPE="$2"
            shift 2
            ;;
        -w|--watch)
            WATCH_MODE=true
            shift
            ;;
        -c|--coverage)
            COVERAGE=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Function to check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    print_success "Dependencies check passed"
}

# Function to install dependencies if needed
install_dependencies() {
    print_status "Checking if dependencies are installed..."
    
    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found, installing dependencies..."
        npm install
        print_success "Dependencies installed"
    else
        print_success "Dependencies already installed"
    fi
}

# Function to setup test environment
setup_test_env() {
    print_status "Setting up test environment..."
    
    # Load test environment variables
    if [ -f "test.env" ]; then
        while IFS='=' read -r key value; do
            [[ $key =~ ^[[:space:]]*# ]] || [[ -z $key ]] && continue
            export "$key=$value"
        done < test.env
        print_success "Test environment variables loaded"
    else
        print_warning "test.env file not found, using default values"
        export NODE_ENV=test
        export MONGODB_TEST_URI=mongodb://localhost:27017/zentavos-test
    fi
    
    # Create test database directory if it doesn't exist
    mkdir -p test-results
    
    print_success "Test environment setup complete"
}

# Function to run specific test type
run_test_type() {
    local test_type=$1
    local jest_args=""
    
    # Build Jest arguments
    if [ "$WATCH_MODE" = true ]; then
        jest_args="$jest_args --watch"
    fi
    
    if [ "$COVERAGE" = true ]; then
        jest_args="$jest_args --coverage"
    fi
    
    if [ "$VERBOSE" = true ]; then
        jest_args="$jest_args --verbose"
    fi
    
    case $test_type in
        "all")
            print_status "Running all tests..."
            npm test "$jest_args"
            ;;
        "unit")
            print_status "Running unit tests..."
            npm run test:unit "$jest_args"
            ;;
        "integration")
            print_status "Running integration tests..."
            npm run test:integration "$jest_args"
            ;;
        "plaid")
            print_status "Running Plaid service tests..."
            npm run test:plaid "$jest_args"
            ;;
        "auth")
            print_status "Running Auth service tests..."
            node --experimental-vm-modules node_modules/.bin/jest tests/unit/auth.service.test.js "$jest_args"
            ;;
        "accounts")
            print_status "Running Accounts service tests..."
            node --experimental-vm-modules node_modules/.bin/jest tests/unit/accounts.service.test.js "$jest_args"
            ;;
        "ai")
            print_status "Running AI service tests..."
            node --experimental-vm-modules node_modules/.bin/jest tests/unit/ai.service.test.js "$jest_args"
            ;;
        *)
            print_error "Unknown test type: $test_type"
            show_usage
            exit 1
            ;;
    esac
}

# Function to generate test report
generate_report() {
    if [ "$COVERAGE" = true ]; then
        print_status "Generating coverage report..."
        
        # Check if coverage directory exists
        if [ -d "coverage" ]; then
            print_success "Coverage report generated in coverage/ directory"
            
            # Open coverage report in browser if available
            if command -v open &> /dev/null; then
                open coverage/lcov-report/index.html
            elif command -v xdg-open &> /dev/null; then
                xdg-open coverage/lcov-report/index.html
            fi
        else
            print_warning "Coverage report not found"
        fi
    fi
}

# Function to cleanup test environment
cleanup() {
    print_status "Cleaning up test environment..."
    
    # Remove test artifacts
    rm -rf test-results/temp-*
    
    print_success "Cleanup complete"
}

# Main execution
main() {
    print_status "Starting Zentavos Backend Test Suite"
    echo "=========================================="
    
    # Check dependencies
    check_dependencies
    
    # Install dependencies if needed
    install_dependencies
    
    # Setup test environment
    setup_test_env
    
    # Run tests
    run_test_type "$TEST_TYPE"
    
    # Generate report if coverage was requested
    generate_report
    
    # Cleanup
    cleanup
    
    print_success "Test suite completed successfully!"
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main function
main "$@" 