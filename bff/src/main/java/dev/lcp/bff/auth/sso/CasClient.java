package dev.lcp.bff.auth.sso;

import dev.lcp.bff.auth.AuthException;
import java.io.StringReader;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

/** CAS 票据校验。只接受 serviceValidate 成功响应，XML 解析禁用外部实体。 */
@Component
public class CasClient {

  private final SsoProperties properties;
  private final SsoHttp http;

  public CasClient(SsoProperties properties, SsoHttp http) {
    this.properties = properties;
    this.http = http;
  }

  public SsoIdentity validate(String serviceUrl, String ticket) {
    if (properties.casServerUrl().isBlank()) {
      throw AuthException.badRequest("sso_misconfigured", "CAS 服务地址未配置");
    }
    String base = properties.casServerUrl().replaceAll("/+$", "");
    String path = properties.casValidatePath().startsWith("/")
        ? properties.casValidatePath() : "/" + properties.casValidatePath();
    String url = base + path + "?service=" + encode(serviceUrl) + "&ticket=" + encode(ticket);
    Document document = parse(http.get(url, null));
    NodeList success = document.getElementsByTagNameNS("*", "authenticationSuccess");
    if (success.getLength() == 0) {
      throw AuthException.unauthorized("CAS 票据校验失败");
    }
    Element root = (Element) success.item(0);
    String user = childText(root, "user");
    if (user == null || user.isBlank()) {
      throw AuthException.badRequest("sso_token_invalid", "CAS 响应缺少用户标识");
    }
    Map<String, String> attributes = attributes(root);
    String displayName = first(attributes, "displayName", "display_name", "cn", "name");
    String email = first(attributes, "mail", "email");
    return new SsoIdentity(user, user, email,
        displayName == null || displayName.isBlank() ? user : displayName);
  }

  private static Document parse(String xml) {
    try {
      DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
      factory.setNamespaceAware(true);
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
      factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
      factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
      factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
      factory.setXIncludeAware(false);
      factory.setExpandEntityReferences(false);
      return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    } catch (Exception ex) {
      throw AuthException.badRequest("sso_token_invalid", "CAS 响应无法解析");
    }
  }

  private static Map<String, String> attributes(Element success) {
    Map<String, String> out = new LinkedHashMap<>();
    NodeList nodes = success.getElementsByTagNameNS("*", "attributes");
    for (int i = 0; i < nodes.getLength(); i++) {
      Element attributes = (Element) nodes.item(i);
      NodeList children = attributes.getChildNodes();
      for (int j = 0; j < children.getLength(); j++) {
        Node node = children.item(j);
        if (node instanceof Element element) {
          String name = element.getLocalName() == null
              ? element.getNodeName() : element.getLocalName();
          String value = element.getTextContent();
          if (name != null && value != null) {
            out.putIfAbsent(name, value.trim());
          }
        }
      }
    }
    return out;
  }

  private static String childText(Element parent, String localName) {
    NodeList nodes = parent.getElementsByTagNameNS("*", localName);
    return nodes.getLength() == 0 ? null : nodes.item(0).getTextContent().trim();
  }

  private static String first(Map<String, String> values, String... keys) {
    for (String key : keys) {
      String value = values.get(key);
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return null;
  }

  private static String encode(String value) {
    return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
  }
}