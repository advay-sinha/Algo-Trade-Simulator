package org.zenith.pay.demo.dto;

public class UserDTO {
    private String id;
    private String name;
    private String email;
    private String purpose;

    public UserDTO(String id, String name, String email, String purpose) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.purpose = purpose;
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPurpose() {
        return purpose;
    }

    public void setPurpose(String purpose) {
        this.purpose = purpose;
    }
} 