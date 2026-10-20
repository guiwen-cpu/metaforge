package dev.lcp.bff.connector;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.StringReader;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/** SOAP 响应的安全 XML 转换：禁用 DOCTYPE / 外部实体，按元素名折叠为 JSON。 */
@Component
public class XmlJson {

  private static final int MAX_NODES = 10_000;
  private static final int MAX_DEPTH = 64;

  private final ObjectMapper json;

  public XmlJson(ObjectMapper json) {
    this.json = json;
  }

  public JsonNode parse(String xml) {
    if (xml == null || xml.isBlank()) {
      return json.nullNode();
    }
    try {
      DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
      factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
      factory.setXIncludeAware(false);
      factory.setExpandEntityReferences(false);
      factory.setNamespaceAware(true);
      DocumentBuilder builder = factory.newDocumentBuilder();
      Document document = builder.parse(new InputSource(new StringReader(xml)));
      ObjectNode out = json.createObjectNode();
      int[] count = {0};
      out.set(localName(document.getDocumentElement()), element(document.getDocumentElement(), 0, count));
      return out;
    } catch (Exception ex) {
      throw new XmlFailure("XML 解析失败：" + ex.getMessage());
    }
  }

  public String faultMessage(JsonNode body) {
    JsonNode fault = findFault(body, 0);
    if (fault == null) {
      return null;
    }
    JsonNode message = fault.path("faultstring");
    if (message.isMissingNode() || message.isNull()) {
      message = fault.path("Reason").path("Text");
    }
    if (message.isMissingNode() || message.isNull()) {
      return "SOAP Fault";
    }
    return message.isValueNode() ? message.asText() : message.toString();
  }

  private JsonNode findFault(JsonNode node, int depth) {
    if (node == null || depth > MAX_DEPTH) {
      return null;
    }
    if (node.isObject()) {
      JsonNode direct = node.get("Fault");
      if (direct != null) {
        return direct;
      }
      for (JsonNode child : node) {
        JsonNode found = findFault(child, depth + 1);
        if (found != null) {
          return found;
        }
      }
    } else if (node.isArray()) {
      for (JsonNode child : node) {
        JsonNode found = findFault(child, depth + 1);
        if (found != null) {
          return found;
        }
      }
    }
    return null;
  }

  private JsonNode element(Element element, int depth, int[] count) {
    if (depth > MAX_DEPTH || ++count[0] > MAX_NODES) {
      throw new XmlFailure("XML 结构过大");
    }
    ObjectNode object = json.createObjectNode();
    NamedNodeMap attributes = element.getAttributes();
    for (int i = 0; i < attributes.getLength(); i++) {
      Node attribute = attributes.item(i);
      if (!XMLConstants.XMLNS_ATTRIBUTE_NS_URI.equals(attribute.getNamespaceURI())) {
        object.put("@" + localName(attribute), attribute.getNodeValue());
      }
    }
    boolean hasChildren = false;
    String text = "";
    NodeList children = element.getChildNodes();
    for (int i = 0; i < children.getLength(); i++) {
      Node child = children.item(i);
      if (child.getNodeType() == Node.ELEMENT_NODE) {
        hasChildren = true;
        String name = localName(child);
        JsonNode value = element((Element) child, depth + 1, count);
        JsonNode existing = object.get(name);
        if (existing == null) {
          object.set(name, value);
        } else if (existing instanceof ArrayNode array) {
          array.add(value);
        } else {
          ArrayNode array = json.createArrayNode();
          array.add(existing);
          array.add(value);
          object.set(name, array);
        }
      } else if (child.getNodeType() == Node.TEXT_NODE
          || child.getNodeType() == Node.CDATA_SECTION_NODE) {
        text += child.getNodeValue();
      }
    }
    if (!hasChildren && object.isEmpty()) {
      return json.getNodeFactory().textNode(text.trim());
    }
    if (!text.isBlank()) {
      object.put("#text", text.trim());
    }
    return object;
  }

  private static String localName(Node node) {
    String local = node.getLocalName();
    return local == null || local.isBlank() ? node.getNodeName() : local;
  }

  public static class XmlFailure extends RuntimeException {

    public XmlFailure(String message) {
      super(message);
    }
  }
}
