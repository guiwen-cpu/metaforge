package dev.lcp.bff.connector;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class XmlJsonTest {

  private final XmlJson xml = new XmlJson(new ObjectMapper());

  @Test
  void parsesNamespacesAndRepeatedNodes() {
    JsonNode parsed = xml.parse("""
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <Result>
              <item sku="A">one</item>
              <item sku="B">two</item>
            </Result>
          </soap:Body>
        </soap:Envelope>
        """);
    JsonNode items = parsed.path("Envelope").path("Body").path("Result").path("item");
    assertThat(items.isArray()).isTrue();
    assertThat(items).hasSize(2);
    assertThat(items.get(0).path("@sku").asText()).isEqualTo("A");
    assertThat(items.get(0).path("#text").asText()).isEqualTo("one");
  }

  @Test
  void rejectsDoctypeDeclarations() {
    assertThatThrownBy(() -> xml.parse("""
        <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
        <foo>&xxe;</foo>
        """))
        .isInstanceOf(XmlJson.XmlFailure.class);
  }

  @Test
  void extractsSoapFaultMessage() {
    JsonNode parsed = xml.parse("""
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <soap:Fault><faultstring>upstream boom</faultstring></soap:Fault>
          </soap:Body>
        </soap:Envelope>
        """);
    assertThat(xml.faultMessage(parsed)).isEqualTo("upstream boom");
  }
}
