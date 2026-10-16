// 由 tools/gen-java.mjs 生成，请勿手工修改。改契约请改 schema/ 或 registry/ 后重新生成。
package dev.lcp.schema.v01.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/**
 * 鉴权方式。凭证一律以引用形式声明（secretRef），实际值存于平台密钥库并按租户隔离，绝不落进 Schema。
 * 判别联合：按 type 的取值分派到成员类，成员类持有同名 const 字段作为单一来源。
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.EXISTING_PROPERTY, property = "type", visible = true)
@JsonSubTypes({
    @JsonSubTypes.Type(value = LogicApiAuthNone.class, name = "none"),
    @JsonSubTypes.Type(value = LogicApiAuthTenant.class, name = "tenant"),
    @JsonSubTypes.Type(value = LogicApiAuthBearer.class, name = "bearer"),
    @JsonSubTypes.Type(value = LogicApiAuthApiKey.class, name = "apiKey"),
    @JsonSubTypes.Type(value = LogicApiAuthBasic.class, name = "basic"),
    @JsonSubTypes.Type(value = LogicApiAuthOauth2.class, name = "oauth2"),
    @JsonSubTypes.Type(value = LogicApiAuthSignature.class, name = "signature"),
})
public interface LogicApiAuth {
}
