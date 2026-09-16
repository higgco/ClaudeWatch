const protobuf = require("protobufjs");

// Minimal official OTLP trace schema. Keeping only the fields ClaudeWatch reads
// lets us decode standards-compliant OTLP/HTTP protobuf without pulling in a
// full collector or generated bindings for unrelated signals.
const schema = `
  syntax = "proto3";

  message ExportTraceServiceRequest {
    repeated ResourceSpans resource_spans = 1;
  }

  message ResourceSpans {
    Resource resource = 1;
    repeated ScopeSpans scope_spans = 2;
    string schema_url = 3;
  }

  message Resource {
    repeated KeyValue attributes = 1;
    uint32 dropped_attributes_count = 2;
  }

  message ScopeSpans {
    InstrumentationScope scope = 1;
    repeated Span spans = 2;
    string schema_url = 3;
  }

  message InstrumentationScope {
    string name = 1;
    string version = 2;
    repeated KeyValue attributes = 3;
    uint32 dropped_attributes_count = 4;
  }

  message Span {
    bytes trace_id = 1;
    bytes span_id = 2;
    string trace_state = 3;
    bytes parent_span_id = 4;
    string name = 5;
    int32 kind = 6;
    fixed64 start_time_unix_nano = 7;
    fixed64 end_time_unix_nano = 8;
    repeated KeyValue attributes = 9;
    uint32 dropped_attributes_count = 10;
  }

  message KeyValue {
    string key = 1;
    AnyValue value = 2;
  }

  message AnyValue {
    oneof value {
      string string_value = 1;
      bool bool_value = 2;
      int64 int_value = 3;
      double double_value = 4;
      ArrayValue array_value = 5;
      KeyValueList kvlist_value = 6;
      bytes bytes_value = 7;
    }
  }

  message ArrayValue {
    repeated AnyValue values = 1;
  }

  message KeyValueList {
    repeated KeyValue values = 1;
  }
`;

const root = protobuf.parse(schema).root;
const ExportTraceServiceRequest = root.lookupType("ExportTraceServiceRequest");

function decodeOtlpTraces(buffer) {
  const message = ExportTraceServiceRequest.decode(buffer);
  return ExportTraceServiceRequest.toObject(message, {
    arrays: true,
    bytes: String,
    defaults: false,
    enums: String,
    longs: String,
    objects: true,
    oneofs: false,
  });
}

module.exports = { decodeOtlpTraces };
