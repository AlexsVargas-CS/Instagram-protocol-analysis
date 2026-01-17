#!/usr/bin/env python3
"""
Export mitmproxy flows to readable format.

Usage:
    python export-flow.py <input.flow> [output_dir]

This script reads a mitmproxy flow file and exports each request/response
to a human-readable format for analysis.
"""

import sys
import os
import json
from datetime import datetime

try:
    from mitmproxy import io as mitmio
    from mitmproxy.http import HTTPFlow
except ImportError:
    print("Error: mitmproxy not installed")
    print("Install with: pip install mitmproxy")
    sys.exit(1)


def export_flow(flow: HTTPFlow, output_dir: str, index: int) -> dict:
    """Export a single flow to JSON format."""
    
    request = flow.request
    response = flow.response
    
    # Build request data
    request_data = {
        "timestamp": datetime.fromtimestamp(flow.timestamp_start).isoformat(),
        "method": request.method,
        "url": request.pretty_url,
        "host": request.host,
        "path": request.path,
        "headers": dict(request.headers),
        "cookies": dict(request.cookies),
    }
    
    # Try to get request body
    try:
        if request.content:
            # Try to parse as JSON
            try:
                request_data["body"] = json.loads(request.content)
            except:
                # Try to decode as text
                try:
                    request_data["body"] = request.content.decode('utf-8')
                except:
                    request_data["body"] = f"<binary: {len(request.content)} bytes>"
    except:
        pass
    
    # Build response data
    response_data = None
    if response:
        response_data = {
            "status_code": response.status_code,
            "reason": response.reason,
            "headers": dict(response.headers),
        }
        
        # Try to get response body
        try:
            if response.content:
                try:
                    response_data["body"] = json.loads(response.content)
                except:
                    try:
                        text = response.content.decode('utf-8')
                        # Truncate large responses
                        if len(text) > 10000:
                            response_data["body"] = text[:10000] + f"... (truncated, total {len(text)} chars)"
                        else:
                            response_data["body"] = text
                    except:
                        response_data["body"] = f"<binary: {len(response.content)} bytes>"
        except:
            pass
    
    return {
        "index": index,
        "request": request_data,
        "response": response_data,
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "./exported"
    
    if not os.path.exists(input_file):
        print(f"Error: File not found: {input_file}")
        sys.exit(1)
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Reading flows from: {input_file}")
    print(f"Output directory: {output_dir}")
    
    # Read flows
    flows = []
    with open(input_file, "rb") as f:
        reader = mitmio.FlowReader(f)
        for flow in reader.stream():
            if isinstance(flow, HTTPFlow):
                flows.append(flow)
    
    print(f"Found {len(flows)} HTTP flows")
    
    # Filter Instagram flows
    ig_flows = [f for f in flows if "instagram" in f.request.host.lower()]
    print(f"Instagram flows: {len(ig_flows)}")
    
    # Export flows
    exported = []
    for i, flow in enumerate(ig_flows):
        data = export_flow(flow, output_dir, i)
        exported.append(data)
        
        # Also save individual request files
        filename = f"{i:04d}_{flow.request.method}_{flow.request.path.replace('/', '_')[:50]}.json"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2, default=str)
    
    # Save summary
    summary = {
        "total_flows": len(flows),
        "instagram_flows": len(ig_flows),
        "exported_at": datetime.now().isoformat(),
        "endpoints": {}
    }
    
    # Group by endpoint
    for data in exported:
        endpoint = f"{data['request']['method']} {data['request']['path']}"
        if endpoint not in summary["endpoints"]:
            summary["endpoints"][endpoint] = {
                "count": 0,
                "status_codes": []
            }
        summary["endpoints"][endpoint]["count"] += 1
        if data["response"]:
            summary["endpoints"][endpoint]["status_codes"].append(
                data["response"]["status_code"]
            )
    
    summary_path = os.path.join(output_dir, "_summary.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"\nExported {len(ig_flows)} flows to {output_dir}")
    print(f"Summary saved to: {summary_path}")
    
    # Print endpoint summary
    print("\nEndpoint Summary:")
    print("-" * 60)
    for endpoint, info in sorted(summary["endpoints"].items(), key=lambda x: -x[1]["count"]):
        codes = ", ".join(map(str, set(info["status_codes"])))
        print(f"  {info['count']:3d}x  {endpoint[:50]}")
        if codes:
            print(f"       Status: {codes}")


if __name__ == "__main__":
    main()
